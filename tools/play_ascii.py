#!/usr/bin/env python3
"""Play a Studio gzip-JSON .ascii document in a terminal."""

import argparse
import base64
import bisect
from contextlib import ExitStack
import gzip
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata

MAX_COMPRESSED_BYTES = 110 * 1024 * 1024
MAX_EXPANDED_BYTES = 250 * 1024 * 1024
ANSI_RESET = "\033[0m"


class TerminalKeyboard:
    def __init__(self):
        self.fd = None
        self.attributes = None
        self.pending = ""
        self.windows = False

    def __enter__(self):
        if not sys.stdin.isatty():
            return self
        if os.name == "nt":
            self.windows = True
            return self
        import termios

        self.fd = sys.stdin.fileno()
        self.attributes = termios.tcgetattr(self.fd)
        settings = termios.tcgetattr(self.fd)
        settings[3] &= ~(termios.ICANON | termios.ECHO)
        settings[6][termios.VMIN] = 0
        settings[6][termios.VTIME] = 0
        termios.tcsetattr(self.fd, termios.TCSANOW, settings)
        return self

    def __exit__(self, *_):
        if self.attributes is not None:
            import termios

            termios.tcsetattr(self.fd, termios.TCSANOW, self.attributes)

    def read(self):
        if self.windows:
            import msvcrt

            while msvcrt.kbhit():
                self.pending += msvcrt.getwch()
        elif self.fd is not None:
            import select

            if select.select([self.fd], [], [], 0)[0]:
                self.pending += os.read(self.fd, 64).decode("ascii", errors="ignore")
        commands = []
        sequences = {
            " ": "pause",
            "\033[C": "forward",
            "\033[D": "backward",
            "\033OC": "forward",
            "\033OD": "backward",
            "\xe0M": "forward",
            "\xe0K": "backward",
            "\x00M": "forward",
            "\x00K": "backward",
        }
        while self.pending:
            for sequence, command in sequences.items():
                if self.pending.startswith(sequence):
                    commands.append(command)
                    self.pending = self.pending[len(sequence):]
                    break
            else:
                if any(sequence.startswith(self.pending) for sequence in sequences):
                    break
                self.pending = self.pending[1:]
        return commands


def load_document(path):
    with open(path, "rb") as source:
        return load_document_stream(source, os.fstat(source.fileno()).st_size)


def load_document_stream(source, compressed):
    if compressed > MAX_COMPRESSED_BYTES:
        raise ValueError("Il file .ascii supera il limite compresso di 110 MiB.")
    if source.read(2) != b"\x1f\x8b":
        raise ValueError("Il file non è un documento .ascii gzip valido.")
    source.seek(0)
    with gzip.GzipFile(fileobj=source) as stream:
        payload = stream.read(MAX_EXPANDED_BYTES + 1)
    if len(payload) > MAX_EXPANDED_BYTES:
        raise ValueError("Il documento .ascii supera il limite decompresso di 250 MiB.")
    document = json.loads(payload.decode("utf-8"))
    if not isinstance(document, dict):
        raise ValueError("Formato o versione del documento .ascii non supportati.")
    if (
        document.get("format") != "ascii-gpu-studio"
        or document.get("version") != 1
        or document.get("contentType") not in ("image", "video")
    ):
        raise ValueError("Formato o versione del documento .ascii non supportati.")
    render = document.get("render")
    frames = document.get("frames")
    if not isinstance(render, dict) or not isinstance(frames, list) or not frames:
        raise ValueError("Documento .ascii privo di rendering o frame.")
    columns, rows = render.get("columns"), render.get("rows")
    if (
        not isinstance(columns, int)
        or not isinstance(rows, int)
        or columns < 1
        or rows < 1
        or columns * rows > 100_000
    ):
        raise ValueError("Dimensioni della griglia .ascii non valide.")

    colors = render.get("colors", {})
    if (
        not isinstance(colors, dict)
        or colors.get("mode") not in ("mono", "rgb", "bw")
        or any(
            not isinstance(colors.get(name), str)
            or re.fullmatch(r"#[\da-fA-F]{6}", colors[name]) is None
            for name in ("foreground", "background")
        )
    ):
        raise ValueError("Modalità o colori non validi nel documento .ascii.")
    if colors["mode"] == "bw" and (
        colors["foreground"].lower() != "#ffffff"
        or colors["background"].lower() != "#000000"
    ):
        raise ValueError("Modalità o colori non validi nel documento .ascii.")
    previous_timestamp = -1
    for frame in frames:
        text = frame.get("text") if isinstance(frame, dict) else None
        timestamp = frame.get("timestampMs") if isinstance(frame, dict) else None
        duration = frame.get("durationMs") if isinstance(frame, dict) else None
        if (
            not isinstance(text, str)
            or len(text.split("\n")) != rows
            or any(len(line) != columns for line in text.split("\n"))
            or not isinstance(timestamp, (int, float))
            or not math.isfinite(timestamp)
            or timestamp < 0
            or timestamp <= previous_timestamp
            or not isinstance(duration, (int, float))
            or not math.isfinite(duration)
            or duration < 0
        ):
            raise ValueError("Frame o tempi non validi nel documento .ascii.")
        previous_timestamp = timestamp
        encoded_colors = frame.get("colors")
        if encoded_colors is not None:
            try:
                cell_colors = base64.b64decode(encoded_colors, validate=True)
            except (ValueError, TypeError) as error:
                raise ValueError("Colori per cella non validi nel documento .ascii.") from error
            if len(cell_colors) != columns * rows * 3:
                raise ValueError("Colori per cella non validi nel documento .ascii.")
            frame["_cell_colors"] = cell_colors

    if document["contentType"] == "image" and (
        len(frames) != 1 or document.get("audio") is not None
    ):
        raise ValueError("Un documento immagine deve contenere un frame e nessun audio.")
    audio = document.get("audio")
    if audio is not None:
        try:
            audio_data = base64.b64decode(audio["dataBase64"], validate=True)
            audio_offset = audio["offsetMs"]
            mime_type = audio["mimeType"]
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError("Traccia audio non valida nel documento .ascii.") from error
        if (
            not audio_data
            or not isinstance(mime_type, str)
            or not isinstance(audio_offset, (int, float))
            or not math.isfinite(audio_offset)
        ):
            raise ValueError("Traccia audio non valida nel documento .ascii.")
        audio["_decoded"] = audio_data
    return document


def cell_width(character):
    if unicodedata.combining(character):
        return 0
    return 2 if unicodedata.east_asian_width(character) in ("F", "W") else 1


def safe_line(line):
    return "".join(
        " " if unicodedata.category(character) in ("Cc", "Cf", "Cs") else character
        for character in line
    )


def crop_center_cells(line, width):
    """Return cropped display cells paired with their source character indices."""
    visible = []
    position = 0
    source_index = 0
    for character in safe_line(line):
        size = cell_width(character)
        if size == 0:
            if visible:
                left, right, previous, index = visible[-1]
                visible[-1] = (left, right, previous + character, index)
            continue
        visible.append((position, position + size, character, source_index))
        position += size
        source_index += 1
    start = max(0, (position - width) // 2)
    end = start + width
    cells = [" "] * (position if position <= width else width)
    source_indices = [None] * len(cells)
    for left, right, character, index in visible:
        if position <= width or (left >= start and right <= end):
            target = left if position <= width else left - start
            cells[target] = character
            source_indices[target] = index
            if right - left == 2:
                cells[target + 1] = ""
                source_indices[target + 1] = index
    return list(zip(cells, source_indices))


def crop_center(line, width):
    """Center-crop a Unicode line to terminal display cells."""
    return "".join(character for character, _ in crop_center_cells(line, width))


def parse_color(value):
    if not isinstance(value, str) or len(value) != 7 or value[0] != "#":
        return (0, 0, 0)
    try:
        return tuple(int(value[offset : offset + 2], 16) for offset in (1, 3, 5))
    except ValueError:
        return (0, 0, 0)


def render_frame(document, frame_index, terminal_width, terminal_height, color=True):
    render = document["render"]
    frame = document["frames"][frame_index]
    lines = frame["text"].split("\n")
    columns = render["columns"]
    rows = render["rows"]
    top = max(0, (terminal_height - rows) // 2)
    first_row = max(0, (rows - terminal_height) // 2)
    mode = render.get("colors", {}).get("mode", "mono")
    foreground = parse_color(render.get("colors", {}).get("foreground", "#ffffff"))
    cell_colors = frame.get("_cell_colors")
    output = []
    if color:
        output.append(ANSI_RESET + "\033[40m")
    output.append("\033[2J\033[H")
    output.extend("\n" for _ in range(top))

    for terminal_row in range(min(rows, terminal_height)):
        source_y = first_row + terminal_row
        line = safe_line(lines[source_y])
        line_width = sum(cell_width(char) for char in line)
        left = max(0, (terminal_width - line_width) // 2)
        cropped = crop_center_cells(line, terminal_width)
        output.append(" " * left)
        for glyph, cell_x in cropped:
            if glyph == "":
                continue
            if color and cell_colors is not None and mode in ("rgb", "mono") and cell_x is not None:
                cell_x = min(columns - 1, max(0, cell_x))
                offset = (source_y * columns + cell_x) * 3
                red, green, blue = cell_colors[offset : offset + 3]
                output.append(f"\033[38;2;{red};{green};{blue}m")
            elif color:
                output.append(f"\033[38;2;{foreground[0]};{foreground[1]};{foreground[2]}m")
            output.append(glyph)
        if terminal_row < min(rows, terminal_height) - 1:
            output.append("\n")
    output.append(ANSI_RESET)
    return "".join(output)


def terminal_size():
    try:
        size = os.get_terminal_size(sys.stdout.fileno())
        return size.columns, size.lines
    except OSError:
        size = shutil.get_terminal_size((80, 24))
        return size.columns, size.lines


def start_audio(audio, executable, temporary_path, position=0):
    if audio is None:
        return None
    if executable is None:
        raise RuntimeError(
            "Il documento contiene audio ma ffplay non è installato. "
            "Installa FFmpeg oppure usa --no-audio."
        )
    with open(temporary_path, "wb") as target:
        target.write(audio["_decoded"])
    offset = audio["offsetMs"] / 1000 - position
    command = [
        executable,
        "-nodisp",
        "-autoexit",
        "-loglevel",
        "error",
        "-vn",
    ]
    if offset < 0:
        command.extend(["-ss", str(-offset)])
    elif offset > 0:
        command.extend(["-af", f"adelay={round(offset * 1000)}:all=1"])
    command.extend(["-i", temporary_path])
    return subprocess.Popen(
        command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )


def stop_audio(process):
    if process is not None and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def play(document, fps=None, color=True, audio_enabled=True, ffplay="ffplay"):
    frames = document["frames"]
    timestamps = [frame["timestampMs"] / 1000 for frame in frames]
    end_time = max(
        timestamps[-1] + frames[-1]["durationMs"] / 1000,
        0,
    )
    if document["contentType"] == "image":
        width, height = terminal_size()
        sys.stdout.write(render_frame(document, 0, width, height, color))
        sys.stdout.flush()
        return

    audio = document.get("audio") if audio_enabled else None
    player = shutil.which(ffplay) if audio else None
    if audio and player is None:
        raise RuntimeError(
            "Il documento contiene audio ma ffplay non è installato. "
            "Installa FFmpeg oppure usa --no-audio."
        )

    audio_file = None
    audio_process = None
    resources = ExitStack()
    try:
        keyboard = resources.enter_context(TerminalKeyboard())
        if audio:
            handle = tempfile.NamedTemporaryFile(suffix=".audio", delete=False)
            audio_file = handle.name
            handle.close()
            audio_process = start_audio(audio, player, audio_file)

        # Absolute timestamps and dropped late frames prevent accumulated drift.
        clock_start = time.monotonic()
        position = 0
        paused = False
        next_frame = 0
        last_drawn = -1
        next_allowed_draw = clock_start
        while True:
            now = time.monotonic()
            elapsed = position if paused else position + now - clock_start
            commands = keyboard.read()
            if commands:
                elapsed = min(end_time, elapsed)
                for command in commands:
                    if command == "pause":
                        paused = not paused
                    elif command == "forward":
                        elapsed = min(end_time, elapsed + 10)
                    elif command == "backward":
                        elapsed = max(0, elapsed - 10)
                stop_audio(audio_process)
                audio_process = None
                if audio and not paused and elapsed < end_time:
                    audio_process = start_audio(audio, player, audio_file, position=elapsed)
                position = elapsed
                clock_start = time.monotonic()
                now = clock_start
                last_drawn = -1
                next_allowed_draw = now
            if elapsed >= end_time and not paused:
                break
            frame_index = max(0, bisect.bisect_right(timestamps, elapsed) - 1)
            if frame_index != last_drawn and now >= next_allowed_draw:
                width, height = terminal_size()
                sys.stdout.write(render_frame(document, frame_index, width, height, color))
                sys.stdout.flush()
                last_drawn = frame_index
                next_frame = frame_index + 1
                next_allowed_draw = now + (1 / fps if fps else 0)
            if paused:
                time.sleep(0.02)
                continue
            next_time = timestamps[next_frame] if next_frame < len(timestamps) else end_time
            wait = max(0, min(next_time - elapsed, next_allowed_draw - now))
            if wait <= 0:
                time.sleep(min(0.01, max(0.001, end_time - elapsed)))
            else:
                time.sleep(min(wait, 0.05))
    finally:
        try:
            stop_audio(audio_process)
            if audio_file and os.path.exists(audio_file):
                os.unlink(audio_file)
        finally:
            resources.close()
            sys.stdout.write(ANSI_RESET + "\033[?25h\n")
            sys.stdout.flush()


def parse_args(argv=None, embedded=False):
    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog="Controlli video: Spazio pausa/riprendi, freccia destra +10 s, sinistra -10 s, Ctrl+C esci.",
    )
    if not embedded:
        parser.add_argument("file", help="file .ascii gzip JSON da riprodurre")
    parser.add_argument(
        "--fps",
        type=float,
        help="frequenza massima di aggiornamento; senza questa opzione segue i timestamp adattivamente",
    )
    parser.add_argument("--no-audio", action="store_true", help="non riprodurre l'audio incorporato")
    parser.add_argument("--no-color", action="store_true", help="disabilita i colori ANSI")
    parser.add_argument("--ffplay", default="ffplay", help="eseguibile ffplay (default: ffplay)")
    options = parser.parse_args(argv)
    if options.fps is not None and (
        not math.isfinite(options.fps) or options.fps <= 0 or options.fps > 240
    ):
        parser.error("--fps deve essere maggiore di 0 e non superiore a 240.")
    return options


def main(argv=None, embedded_base64=None):
    options = parse_args(argv, embedded=embedded_base64 is not None)
    try:
        if embedded_base64 is None:
            document = load_document(options.file)
        else:
            if len(embedded_base64) > 4 * ((MAX_COMPRESSED_BYTES + 2) // 3):
                raise ValueError("Il file .ascii supera il limite compresso di 110 MiB.")
            compressed = base64.b64decode(embedded_base64, validate=True)
            with io.BytesIO(compressed) as source:
                document = load_document_stream(source, len(compressed))
        if document["contentType"] == "image":
            width, height = terminal_size()
            sys.stdout.write(
                render_frame(
                    document,
                    0,
                    width,
                    height,
                    not options.no_color and sys.stdout.isatty(),
                )
            )
            sys.stdout.write(ANSI_RESET + "\033[?25h\n")
            sys.stdout.flush()
        else:
            sys.stdout.write("\033[?25l")
            sys.stdout.flush()
            play(
                document,
                fps=options.fps,
                color=not options.no_color and sys.stdout.isatty(),
                audio_enabled=not options.no_audio,
                ffplay=options.ffplay,
            )
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError, UnicodeDecodeError) as error:
        sys.stdout.write(ANSI_RESET + "\033[?25h\n")
        sys.stdout.flush()
        sys.stderr.write(f"Errore: {error}\n")
        return 1
    except KeyboardInterrupt:
        sys.stdout.write(ANSI_RESET + "\033[?25h\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(embedded_base64=globals().get("EMBEDDED_ASCII")))
