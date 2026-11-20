"""Extract the Demo 4 upload and reference workbooks into separate local files."""

import argparse
import io
import json
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

from openpyxl import load_workbook


def read_workbook(archive, filename):
    paths = [name for name in archive.namelist() if PurePosixPath(name).name == filename]
    if len(paths) != 1:
        raise ValueError(f"Expected one {filename} in the archive, found {len(paths)}")
    return load_workbook(io.BytesIO(archive.read(paths[0])), read_only=True, data_only=True)


def export_sheet(workbook, sheet, destination):
    values = iter(workbook[sheet].values)
    headers = next(values)
    rows = [
        {key: value for key, value in zip(headers, row) if key is not None}
        for row in values if any(value is not None for value in row)
    ]
    with destination.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(rows, stream, ensure_ascii=False, indent=2, default=str)
        stream.write("\n")
    print(f"{sheet}: {len(rows)} rows")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path, help="A new directory outside Git or under ignored desktop-build/")
    args = parser.parse_args()
    inputs = args.output / "inputs"
    args.output.mkdir(parents=True)
    inputs.mkdir()
    with ZipFile(args.archive) as archive:
        workbook = read_workbook(archive, "Demo4_Evergreen_Synthetic_Upload_Data.xlsx")
        try:
            export_sheet(workbook, "Daily Reports", inputs / "daily-reports.json")
            export_sheet(workbook, "Meeting Transcripts", inputs / "meeting-transcripts.json")
            export_sheet(workbook, "RFIs", inputs / "rfis.json")
        finally:
            workbook.close()
        answer_key = read_workbook(archive, "Demo4_Ground_Truth_RESTRICTED.xlsx")
        try:
            export_sheet(answer_key, "Ground Truth", args.output / "ground-truth.restricted.json")
        finally:
            answer_key.close()


if __name__ == "__main__":
    main()
