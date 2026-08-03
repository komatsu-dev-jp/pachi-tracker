import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve("src/components/tabs/CalendarTab.jsx"), "utf8");
const rotHistorySource = source.slice(source.indexOf("const renderRotHistory"), source.indexOf("const renderJpHistory"));

test("focus-mode record editor starts collapsed and resets when the selection changes", () => {
    assert.match(source, /const \[focusEditFormOpen, setFocusEditFormOpen\] = useState\(false\);/);
    assert.match(source, /setFocusEditFormOpen\(false\);\s*setShowEditStoreDD\(false\);\s*}, \[selectedArchiveId\]\);/);
    assert.match(source, /aria-expanded=\{focusEditFormOpen\}/);
    assert.match(source, /aria-controls=\{`focus-edit-fields-\$\{sel\.id\}`\}/);
    assert.match(source, /\{!focusEditFormOpen && <div className="min-w-0 border-t/);
    assert.match(source, /<div id=\{`focus-edit-fields-\$\{sel\.id\}`\} hidden=\{!focusEditFormOpen\}/);
    assert.doesNotMatch(source, /\{focusEditFormOpen && <div id=\{`focus-edit-fields-\$\{sel\.id\}`\}/);
});

test("focus-mode editor restores the compact one-tap add-another-record action", () => {
    assert.match(source, /aria-label="別の遊技記録を追加"/);
    assert.match(source, /className="min-h-11 shrink-0 border-l/);
    assert.match(source, /setAddFormOpen\(true\); setFocusEditFormOpen\(false\); setShowEditStoreDD\(false\); setDelConfirm\(null\);/);
    assert.match(source, /className="flex min-h-11 min-w-0 flex-1/);
});

test("rotation-mode correction is a guarded 44px leading-cell action", () => {
    assert.match(rotHistorySource, /gridTemplateColumns: "44px minmax\(0, 1fr\) minmax\(0, 1fr\) minmax\(0, 1fr\) 48px 48px"/);
    assert.match(rotHistorySource, /const isEditable = isEditableRotationModeRow\(row\);/);
    assert.match(rotHistorySource, /\{isEditable \? \(/);
    assert.match(rotHistorySource, /width: 44, minHeight: 44/);
    assert.match(rotHistorySource, /aria-label=\{`遊技方法を修正（\$\{i \+ 1\}行目、現在は\$\{modeLabel\}）`\}/);
    assert.match(rotHistorySource, /createRotationModeFingerprint\(row, i\)/);
    assert.match(rotHistorySource, /createArchiveCorrectionFingerprint\(a\)/);
    assert.doesNotMatch(rotHistorySource, /gridColumn: "1 \/ -1"/);
});
