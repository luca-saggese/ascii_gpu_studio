import base64
import gzip
import io
import json
import tempfile
import unittest
from unittest.mock import patch

from play_ascii import crop_center, load_document, main, render_frame, start_audio


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


if __name__ == "__main__":
    unittest.main()
