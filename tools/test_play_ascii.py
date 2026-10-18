import base64
import gzip
import io
import json
import os
import tempfile
import unittest
from unittest.mock import Mock, patch

from play_ascii import (
    TerminalKeyboard, crop_center, load_document, load_document_stream,
    main, play, render_frame, start_audio,
)


def sample_document():
    return {
        "format": "ascii-gpu-studio",
        "version": 1,
        "contentType": "video",
        "render": {
            "columns": 4,
            "rows": 2,
            "colors": {
                "mode": "rgb",
                "foreground": "#ffffff",
                "background": "#000000",
            },
        },
        "frames": [
            {
                "timestampMs": 0,
                "durationMs": 100,
                "text": "ABCD\nEFGH",
                "colors": base64.b64encode(bytes(range(24))).decode(),
            },
            {"timestampMs": 100, "durationMs": 100, "text": "1234\n5678"},
        ],
    }


class TerminalAsciiPlayerTests(unittest.TestCase):
    def test_loads_gzip_document_and_decodes_per_cell_rgb(self):
        with tempfile.NamedTemporaryFile() as file:
            file.write(gzip.compress(json.dumps(sample_document()).encode()))
            file.flush()
            document = load_document(file.name)
        self.assertEqual(document["frames"][0]["text"], "ABCD\nEFGH")
        self.assertEqual(document["frames"][0]["_cell_colors"], bytes(range(24)))

    def test_rejects_incorrect_frame_dimensions(self):
        document = sample_document()
        document["frames"][0]["text"] = "short\nEFGH"
        with tempfile.NamedTemporaryFile() as file:
            file.write(gzip.compress(json.dumps(document).encode()))
            file.flush()
            with self.assertRaisesRegex(ValueError, "Frame o tempi"):
                load_document(file.name)

    def test_rejects_non_object_json(self):
        with tempfile.NamedTemporaryFile() as file:
            file.write(gzip.compress(b"[]"))
            file.flush()
            with self.assertRaisesRegex(ValueError, "Formato o versione"):
                load_document(file.name)

    def test_embedded_document_uses_the_same_validation_and_audio_decoder(self):
        document = sample_document()
        document["audio"] = {
            "mimeType": "audio/webm",
            "offsetMs": 25,
            "dataBase64": base64.b64encode(b"original audio").decode(),
        }
        compressed = gzip.compress(json.dumps(document).encode())
        loaded = load_document_stream(io.BytesIO(compressed), len(compressed))
        self.assertEqual(loaded["audio"]["_decoded"], b"original audio")
        with patch("play_ascii.play") as play, patch("play_ascii.sys.stdout", io.StringIO()):
            self.assertEqual(
                main(["--no-audio"], embedded_base64=base64.b64encode(compressed).decode()), 0
            )
        self.assertEqual(play.call_args.args[0]["audio"]["_decoded"], b"original audio")
        self.assertFalse(play.call_args.kwargs["audio_enabled"])

    def test_embedded_payload_rejects_invalid_base64_and_compression_limits(self):
        errors = io.StringIO()
        with patch("play_ascii.sys.stderr", errors), patch("play_ascii.sys.stdout", io.StringIO()):
            self.assertEqual(main([], embedded_base64="invalid!"), 1)
            with patch("play_ascii.MAX_COMPRESSED_BYTES", 1):
                self.assertEqual(main([], embedded_base64="AAAAAA=="), 1)
        self.assertIn("Errore:", errors.getvalue())
        self.assertIn("limite compresso", errors.getvalue())

    def test_centers_and_crops_unicode_by_terminal_cells(self):
        self.assertEqual(crop_center("abcdef", 4), "bcde")
        self.assertEqual(crop_center("界a界", 3), " a ")
        self.assertEqual(crop_center("界a", 4), "界a")

    def test_centers_frame_and_uses_cell_rgb(self):
        with tempfile.NamedTemporaryFile() as file:
            file.write(gzip.compress(json.dumps(sample_document()).encode()))
            file.flush()
            document = load_document(file.name)
        output = render_frame(document, 0, 8, 4, color=True)
        self.assertIn("\033[38;2;0;1;2mA", output)
        self.assertIn("\033[38;2;9;10;11mD", output)
        self.assertIn("\033[2J\033[H", output)

    def test_monochrome_uses_one_gray_per_glyph(self):
        document = sample_document()
        document["render"]["colors"]["mode"] = "mono"
        grays = bytes(channel for gray in range(32, 232, 25) for channel in [gray] * 3)
        document["frames"][0]["_cell_colors"] = grays
        output = render_frame(document, 0, 8, 4, color=True)
        self.assertIn("\033[38;2;32;32;32mA", output)
        self.assertIn("\033[38;2;107;107;107mD", output)

    def test_keeps_black_background_across_rows_and_centering_on_light_terminals(self):
        document = sample_document()
        document["render"]["colors"]["background"] = "#ffffff"
        output = render_frame(document, 0, 8, 4, color=True)
        self.assertTrue(output.startswith("\033[0m\033[40m\033[2J\033[H"))
        self.assertEqual(output.count("\033[0m"), 2)
        self.assertTrue(output.endswith("\033[0m"))
        self.assertNotIn("\033[0m\n", output)
        self.assertNotIn("\033[48;2;255;255;255m", output)
        self.assertIn("\n  \033[38;2;255;255;255mE", output)

    def test_no_color_does_not_force_terminal_background(self):
        output = render_frame(sample_document(), 0, 8, 4, color=False)
        self.assertNotIn("\033[40m", output)
        self.assertNotIn("\033[38;", output)
        self.assertNotIn("\033[48;", output)

    def test_interrupted_playback_restores_default_colors_and_cursor(self):
        output = io.StringIO()
        with (
            patch("play_ascii.load_document", return_value=sample_document()),
            patch("play_ascii.play", side_effect=KeyboardInterrupt),
            patch("play_ascii.sys.stdout", output),
        ):
            self.assertEqual(main(["example.ascii", "--no-audio"]), 0)
        self.assertTrue(output.getvalue().endswith("\033[0m\033[?25h\n"))

    def test_applies_positive_audio_offset_in_ffplay_filter(self):
        with tempfile.NamedTemporaryFile() as file, patch(
            "play_ascii.subprocess.Popen"
        ) as popen:
            start_audio(
                {"_decoded": b"audio bytes", "offsetMs": 250},
                "/usr/bin/ffplay",
                file.name,
            )
            command = popen.call_args.args[0]
            self.assertEqual(command[command.index("-af") + 1], "adelay=250:all=1")
            with open(file.name, "rb") as audio_file:
                self.assertEqual(audio_file.read(), b"audio bytes")

    def test_audio_seek_applies_document_offset_before_selecting_audio_position(self):
        for offset, position, expected in [(250, 10, 9.75), (-250, 10, 10.25)]:
            with tempfile.NamedTemporaryFile() as file, patch("play_ascii.subprocess.Popen") as popen:
                start_audio(
                    {"_decoded": b"audio", "offsetMs": offset},
                    "/usr/bin/ffplay", file.name, position=position,
                )
                command = popen.call_args.args[0]
                self.assertEqual(float(command[command.index("-ss") + 1]), expected)
                self.assertNotIn("-af", command)

    def test_keyboard_parses_fragmented_arrows_and_repeated_space_without_blocking(self):
        keyboard = TerminalKeyboard()
        keyboard.pending = " \033["
        self.assertEqual(keyboard.read(), ["pause"])
        self.assertEqual(keyboard.pending, "\033[")
        keyboard.pending += "C\033[D\033OC\033OD  "
        self.assertEqual(keyboard.read(), ["forward", "backward", "forward", "backward", "pause", "pause"])
        keyboard.pending = "\xe0M\xe0K\x00M\x00K"
        self.assertEqual(keyboard.read(), ["forward", "backward", "forward", "backward"])

    def test_noninteractive_input_does_not_change_terminal_settings_or_read_stdin(self):
        with patch("play_ascii.sys.stdin") as stdin:
            stdin.isatty.return_value = False
            with TerminalKeyboard() as keyboard:
                self.assertEqual(keyboard.read(), [])
            stdin.fileno.assert_not_called()

    @unittest.skipIf(os.name == "nt", "POSIX terminal settings")
    def test_real_terminal_keys_and_settings_are_restored_after_interrupt(self):
        import pty
        import termios

        master, slave = pty.openpty()
        try:
            original = termios.tcgetattr(slave)
            stdin = Mock()
            stdin.isatty.return_value = True
            stdin.fileno.return_value = slave
            with patch("play_ascii.sys.stdin", stdin):
                with self.assertRaises(KeyboardInterrupt):
                    with TerminalKeyboard() as keyboard:
                        active = termios.tcgetattr(slave)
                        self.assertFalse(active[3] & termios.ICANON)
                        self.assertFalse(active[3] & termios.ECHO)
                        self.assertEqual(active[3] & termios.ISIG, original[3] & termios.ISIG)
                        os.write(master, b" \x1b[C\x1b[D")
                        import select
                        self.assertTrue(select.select([slave], [], [], 1)[0])
                        self.assertEqual(keyboard.read(), ["pause", "forward", "backward"])
                        raise KeyboardInterrupt
            restored = termios.tcgetattr(slave)
            # macOS may set the transient input-reprocessing flag on canonical restore.
            restored[3] &= ~getattr(termios, "PENDIN", 0)
            original[3] &= ~getattr(termios, "PENDIN", 0)
            self.assertEqual(restored, original)
        finally:
            os.close(master)
            os.close(slave)

    def test_pause_resume_seek_clamping_and_audio_follow_the_same_timeline(self):
        document = sample_document()
        document["frames"] = [
            {"timestampMs": index * 5000, "durationMs": 5000, "text": "ABCD\nEFGH"}
            for index in range(5)
        ]
        document["audio"] = {"_decoded": b"audio", "offsetMs": 0}
        keyboard = Mock()
        keyboard.read.side_effect = [
            [], ["pause"], [], ["forward"], ["backward"], ["backward"],
            ["forward"], ["pause"], ["forward"], ["forward"],
        ]
        clock = [0.0]
        def sleep(duration):
            clock[0] += duration
        processes = []
        def start(*args, **kwargs):
            process = Mock()
            process.poll.return_value = None
            processes.append(process)
            return process
        with (
            patch("play_ascii.TerminalKeyboard") as keys,
            patch("play_ascii.time.monotonic", side_effect=lambda: clock[0]),
            patch("play_ascii.time.sleep", side_effect=sleep),
            patch("play_ascii.start_audio", side_effect=start) as audio,
            patch("play_ascii.shutil.which", return_value="/mock/ffplay"),
            patch("play_ascii.render_frame", return_value="frame") as render,
            patch("play_ascii.terminal_size", return_value=(80, 24)),
            patch("play_ascii.sys.stdout", io.StringIO()),
        ):
            keys.return_value.__enter__.return_value = keyboard
            play(document, fps=1)
        self.assertEqual([call.args[1] for call in render.call_args_list], [0, 0, 2, 0, 0, 2, 2, 4])
        self.assertEqual(audio.call_count, 3)
        self.assertAlmostEqual(audio.call_args_list[1].kwargs["position"], 10, places=2)
        self.assertAlmostEqual(audio.call_args_list[2].kwargs["position"], 20.05, places=2)
        for process in processes:
            process.terminate.assert_called_once()
            process.wait.assert_called_once()
        keys.return_value.__exit__.assert_called_once()
        self.assertFalse(os.path.exists(audio.call_args.args[2]))

    def test_single_frame_video_respects_its_duration(self):
        document = sample_document()
        document["frames"] = [document["frames"][0]]
        clock = [0.0]
        def sleep(duration):
            clock[0] += duration
        with (
            patch("play_ascii.TerminalKeyboard") as keys,
            patch("play_ascii.time.monotonic", side_effect=lambda: clock[0]),
            patch("play_ascii.time.sleep", side_effect=sleep),
            patch("play_ascii.terminal_size", return_value=(80, 24)),
            patch("play_ascii.sys.stdout", io.StringIO()),
        ):
            keys.return_value.__enter__.return_value.read.return_value = []
            play(document, audio_enabled=False)
        self.assertGreaterEqual(clock[0], 0.1)

    def test_interruption_during_keyboard_poll_cleans_up_audio_and_terminal(self):
        document = sample_document()
        document["audio"] = {"_decoded": b"audio", "offsetMs": 0}
        process = Mock()
        process.poll.return_value = None
        output = io.StringIO()
        with (
            patch("play_ascii.TerminalKeyboard") as keys,
            patch("play_ascii.start_audio", return_value=process) as audio,
            patch("play_ascii.shutil.which", return_value="/mock/ffplay"),
            patch("play_ascii.sys.stdout", output),
        ):
            keys.return_value.__enter__.return_value.read.side_effect = KeyboardInterrupt
            with self.assertRaises(KeyboardInterrupt):
                play(document)
        process.terminate.assert_called_once()
        keys.return_value.__exit__.assert_called_once()
        self.assertFalse(os.path.exists(audio.call_args.args[2]))
        self.assertTrue(output.getvalue().endswith("\033[0m\033[?25h\n"))


if __name__ == "__main__":
    unittest.main()
