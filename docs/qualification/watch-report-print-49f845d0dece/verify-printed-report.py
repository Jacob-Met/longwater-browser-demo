#!/usr/bin/env python3
"""Receive the one actual Chrome PDF against independent native state data.
Only layout whitespace is ignored in ordered text identity. No report renderer
or HTML parser supplies expected values.
"""
import hashlib
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent
SHA_ORACLE = "2e5aef1f4269c17dc763796a6109c072c0a6a835b14f1b0012ba9bfb61670163"
HEADERS = ["Cell", "Depth (cm)", "Salt (ppt)", "Oxygen (%)", "Life (%)", "Canopy (/ 3)"]
METRICS = ["depth", "salinity", "oxygen", "biomass", "shade"]
ACTIONS = {"gate": "Gate", "shade": "Shade", "seed": "Seed"}
NS = "{http://www.w3.org/1999/xhtml}"
compact = lambda value: re.sub(r"\s+", "", value)
sha = lambda value: hashlib.sha256(value).hexdigest()

def receive():
    raw = (ROOT / "native-inputs.json").read_bytes()
    assert sha(raw) == SHA_ORACLE
    states = [json.loads(value) for value in json.loads(raw)["snapshots"]]
    assert [state["day"] for state in states] == list(range(15))
    assert states[-1]["finished"] is True and states[-1]["outcome"] == "resilient"
    units, tables, resource_units = [], [], []
    def add(kind, text, **extra):
        units.append({"kind": kind, "text": text, **extra})
    def resources(before, after):
        vals = [str(after[key]) if before is None else f"{before[key]} → {after[key]}" for key in ["freshwater", "seedPacks"]]
        value = f"Freshwater: {vals[0]}. Seed packs: {vals[1]}."
        add("resources", value)
        resource_units.append(value)
    def table(before, after, caption):
        add("caption", caption)
        expected_rows = []
        for cell in after["cells"]:
            previous = None if before is None else next(item for item in before["cells"] if item["id"] == cell["id"])
            values = [str(cell[key]) if previous is None else f"{previous[key]} → {cell[key]}" for key in METRICS]
            expected_rows.append({"cell": cell["name"], "values": values})
            add("row", cell["name"] + " " + " ".join(values), caption=caption)
        tables.append({"caption": caption, "rows": expected_rows})
    add("title", "Longwater watch report")
    add("status", "Watch closed · " + states[-1]["outcome"])
    add("provenance", "A one-time snapshot of this Longwater game’s accepted journal. Recorded from Longwater’s game simulation. Net changes include the action, the tide and dawn drift.")
    add("purpose", "This report can be read or printed without the game. It does not resume a watch or update when play continues.")
    add("heading", "Opening → final readings")
    resources(states[0], states[-1])
    table(states[0], states[-1], "Across the completed watch")
    add("heading", "Opening readings")
    resources(None, states[0])
    table(None, states[0], "Before the first tide")
    for previous, state in zip(states, states[1:]):
        report = state["report"]
        cell = next(cell for cell in state["cells"] if cell["id"] == report["cell"])
        add("tide", f"Tide {state['day']} · {ACTIONS[report['action']]} · {cell['name']}")
        add("event", report["event"]["name"])
        add("event_note", report["event"]["note"])
        add("notes_heading", "Full field notes")
        for note in report["lines"]:
            add("field_note", note)
        resources(previous, state)
        table(previous, state, f"Before → after tide {state['day']}")
    add("footer", "14 of 14 tides recorded. Only completed tides are included. Print using your browser’s Print command.")
    (ROOT / "expected-print-content.json").write_text(json.dumps({"oracle_sha256": SHA_ORACLE, "units": units, "tables": tables}, ensure_ascii=False, indent=2) + "\n")

    document = ET.parse(ROOT / "completed-report.bbox.xhtml")
    page_nodes = document.findall(".//" + NS + "page")
    physical_lines, geometries, overlaps = [], [], []
    for number, page in enumerate(page_nodes, 1):
        width, height = float(page.get("width")), float(page.get("height"))
        words = []
        chunks = []
        for line in page.findall(".//" + NS + "line"):
            ws = [{"text": w.text or "", **{k: float(v) for k, v in w.attrib.items()}} for w in line]
            words.extend(ws)
            chunks.append({"page": number, "y": float(line.get("yMin")), "words": ws})
        chunks.sort(key=lambda chunk: (chunk["y"], min(w["xMin"] for w in chunk["words"])))
        merged = []
        for chunk in chunks:
            if merged and abs(chunk["y"] - merged[-1]["y"]) < 0.5:
                merged[-1]["words"].extend(chunk["words"])
            else:
                merged.append(chunk)
        for line in merged:
            line["words"].sort(key=lambda w: w["xMin"])
            line["text"] = " ".join(w["text"] for w in line["words"])
        physical_lines.extend(merged)
        bounds = {"page": number, "width": width, "height": height, "words": len(words),
                  "xMin": min(w["xMin"] for w in words), "xMax": max(w["xMax"] for w in words),
                  "yMin": min(w["yMin"] for w in words), "yMax": max(w["yMax"] for w in words)}
        margin = 10 / 25.4 * 72
        # Chrome rounds paper/margin geometry to CSS/device units; allow <1 pt.
        assert bounds["xMin"] >= margin - 1 and bounds["yMin"] >= margin - 1, bounds
        assert bounds["xMax"] <= width - margin + 1 and bounds["yMax"] <= height - margin + 1, bounds
        geometries.append(bounds)
        ordered = sorted(words, key=lambda w: w["yMin"])
        for i, left in enumerate(ordered):
            for right in ordered[i + 1:]:
                if right["yMin"] >= left["yMax"] - 0.25:
                    break
                overlap_x = min(left["xMax"], right["xMax"]) - max(left["xMin"], right["xMin"])
                overlap_y = min(left["yMax"], right["yMax"]) - max(left["yMin"], right["yMin"])
                if overlap_x > 0.25 and overlap_y > 0.25:
                    overlaps.append({"page": number, "left": left, "right": right})
    assert not overlaps, {"overlapping_words": overlaps[:5]}
    heading = compact(" ".join(HEADERS))
    observed_lines = [line for line in physical_lines if compact(line["text"]) != heading]
    observed = compact("".join(line["text"] for line in observed_lines))
    expected = compact("".join(unit["text"] for unit in units))
    if observed != expected:
        i = next((i for i, pair in enumerate(zip(observed, expected)) if pair[0] != pair[1]), min(len(observed), len(expected)))
        raise AssertionError({"ordered_text_mismatch_at": i, "observed": observed[max(0, i-60):i+120], "expected": expected[max(0, i-60):i+120], "lengths": [len(observed), len(expected)]})

    caption_map = {compact(table["caption"]): i for i, table in enumerate(tables)}
    current = None
    starts = None
    table_rows = [[] for _ in tables]
    table_headers = [[] for _ in tables]
    caption_order = []
    row_receipts = []
    for line in physical_lines:
        value = compact(line["text"])
        if value in caption_map:
            current = caption_map[value]
            caption_order.append(current)
            starts = None
        elif value == heading:
            assert current is not None
            labels = ["Cell", "Depth", "Salt", "Oxygen", "Life", "Canopy"]
            starts = [next(w["xMin"] for w in line["words"] if w["text"] == label) for label in labels]
            assert starts == sorted(starts)
            table_headers[current].append({"page": line["page"], "y": line["y"], "starts": starts})
        elif re.match(r"^(NorthBank|HeartPool|SouthReach)\d", value):
            assert current is not None and starts is not None
            assert table_headers[current][-1]["page"] == line["page"], "Table page lacks column headings"
            cells = [[] for _ in range(6)]
            for word in line["words"]:
                column = max(i for i, start in enumerate(starts) if word["xMin"] >= start - 1)
                if column < 5:
                    assert word["xMax"] < starts[column + 1] - 1, "Text crosses the next column"
                cells[column].append(word["text"])
            actual = [compact("".join(cell)) for cell in cells]
            expected_row = tables[current]["rows"][len(table_rows[current])]
            wanted = [compact(expected_row["cell"])] + [compact(value) for value in expected_row["values"]]
            assert actual == wanted, {"table": current, "actual": actual, "expected": wanted}
            table_rows[current].append(actual)
            row_receipts.append({"caption": tables[current]["caption"], "cell": expected_row["cell"], "page": line["page"], "y": line["y"], "values": expected_row["values"]})
    assert caption_order == list(range(16)), caption_order
    assert all(len(rows) == 3 for rows in table_rows), [len(rows) for rows in table_rows]
    continuation = [{"caption": tables[i]["caption"], "headers": h} for i, h in enumerate(table_headers) if len(h) > 1]
    header_count = sum(map(len, table_headers))
    assert header_count == len(tables) + sum(len(item["headers"]) - 1 for item in continuation)
    text = (ROOT / "completed-report.layout.txt").read_text()
    assert compact(text).replace(heading, "") == expected, "Independent Poppler layout text must agree with positioned words"
    result = {
        "status": "pass", "pages": len(page_nodes), "tides": 14, "tables": len(tables),
        "table_rows": len(row_receipts), "reading_cells": len(row_receipts) * 5,
        "resource_paragraphs": len(resource_units), "field_notes": sum(unit["kind"] == "field_note" for unit in units),
        "native_event_titles": 14, "native_event_descriptions": 14,
        "ordered_semantic_units": len(units), "ordered_nonwhitespace_characters": len(expected),
        "ordered_pdf_text_equal_native_expectation": True, "word_overlaps": 0,
        "table_headers": header_count, "table_continuations": continuation,
        "row_receipts": row_receipts, "page_geometry": geometries,
        "input_hashes": {name: sha((ROOT / name).read_bytes()) for name in [
            "print-contract.md", "native-inputs.json", "completed-report.html",
            "completed-report.pdf", "completed-report.layout.txt", "completed-report.bbox.xhtml",
            "verify-printed-report.py"]},
        "limits": ["One A4 portrait report at the recorded native Chrome version.",
                   "Whitespace introduced by line wrapping is ignored; all other extracted characters and ordered native values must match.",
                   "Word geometry and exact text do not replace the separately retained rendered-page visual review."]
    }
    return result

if __name__ == "__main__":
    try:
        result = receive()
    except Exception as error:
        result = {"status": "fail", "error": repr(error)}
    (ROOT / "print-verification.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: value for key, value in result.items() if key not in ["row_receipts", "page_geometry"]}, ensure_ascii=False))
    sys.exit(0 if result["status"] == "pass" else 1)
