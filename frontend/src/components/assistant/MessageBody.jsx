import React from "react";
import { AlertIcon, CheckIcon } from "../ui/TwIcons";

/**
 * Renders an assistant reply.
 *
 * The reply is the same Markdown the copilot service and the plant analysers
 * have always produced — nothing about how a message is generated changed here.
 * What changed is the presentation: the shapes those functions happen to emit
 * are recognised and laid out as the product's own components instead of being
 * dumped as a bullet list.
 *
 *   "## <something> Scenario Applied"   → an applied-action banner
 *   "- **Label:** value"                → a key/value row block
 *   "> note"                            → a quiet callout
 *   "⚠️ …"                              → a warning callout (parser feedback)
 *
 * Anything unrecognised falls through to paragraphs and lists, so a free-form
 * answer from the language model still renders correctly.
 */

/** Titles the command handlers use when they have changed the simulator. */
const APPLIED_TITLE = /(controls updated|scenario applied)\s*$/i;

const BULLET = /^(\s*)-\s+(.*)$/;
const KEY_VALUE = /^\*\*(.+?):\*\*\s*(.*)$/;
/** A bullet that packs several labelled facts is a sentence, not a row. */
const PACKED = /\*\*[^*]+:\*\*/;

/** `- **Label:** value` with nothing nested under it and one fact in it. */
function asRow(item) {
  if (item.children.length) return null;
  const match = item.text.match(KEY_VALUE);
  if (!match || PACKED.test(match[2])) return null;
  return { label: match[1], value: match[2] };
}

function inline(text, keyPrefix = "i") {
  return String(text)
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter((part) => part !== "")
    .map((part, idx) => {
      const key = `${keyPrefix}-${idx}`;
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return <code key={key}>{part.slice(1, -1)}</code>;
      }
      return part;
    });
}

/** Markdown → a flat list of blocks this component knows how to draw. */
function toBlocks(text) {
  const blocks = [];
  let list = null; // { items: [{ text, children: [] }] }

  /**
   * Split a run of bullets into alternating stretches: single labelled facts
   * become a key/value block, everything else stays a bullet list. A status
   * summary that mixes both — packed sentences then one-fact lines — gets both
   * treatments in the order it was written.
   */
  const closeList = () => {
    if (!list) return;
    let rows = [];
    let items = [];
    const flushRows = () => {
      if (rows.length) blocks.push({ kind: "rows", rows });
      rows = [];
    };
    const flushItems = () => {
      if (items.length) blocks.push({ kind: "list", items });
      items = [];
    };

    for (const item of list.items) {
      const row = asRow(item);
      if (row) {
        flushItems();
        rows.push(row);
      } else {
        flushRows();
        items.push(item);
      }
    }
    flushRows();
    flushItems();
    list = null;
  };

  for (const rawLine of String(text).split("\n")) {
    const line = rawLine.replace(/\s+$/, "");

    const bullet = line.match(BULLET);
    if (bullet) {
      const [, indent, content] = bullet;
      if (indent.length >= 2 && list?.items.length) {
        list.items[list.items.length - 1].children.push(content);
      } else {
        if (!list) list = { items: [] };
        list.items.push({ text: content, children: [] });
      }
      continue;
    }

    // An indented continuation line belongs to the bullet above it.
    if (/^\s{2,}\S/.test(line) && list?.items.length) {
      list.items[list.items.length - 1].children.push(line.trim());
      continue;
    }

    closeList();

    if (!line.trim()) continue;
    if (line.startsWith("### ")) {
      blocks.push({ kind: "h3", text: line.slice(4).trim() });
    } else if (line.startsWith("## ")) {
      blocks.push({ kind: "h2", text: line.slice(3).trim() });
    } else if (line.startsWith("# ")) {
      blocks.push({ kind: "h2", text: line.slice(2).trim() });
    } else if (line.startsWith("> ")) {
      blocks.push({ kind: "note", text: line.slice(2).trim(), tone: "info" });
    } else if (/^(⚠|❗|‼)/u.test(line)) {
      // The stores prepend a `⚠️ …` line when a command only partly parsed.
      // The text is kept verbatim; the emoji becomes the shell's alert icon.
      blocks.push({ kind: "note", text: line.replace(/^[⚠❗‼️\s]+/u, ""), tone: "warn" });
    } else {
      blocks.push({ kind: "p", text: line });
    }
  }

  closeList();
  return blocks;
}

function Rows({ rows, keyPrefix }) {
  return (
    <div className="tw-asst-rows">
      {rows.map((row, idx) => {
        // `7.0 → **6.5** °C` — the previous value stays quiet, the new one reads
        // as the answer. A plain value carries the emphasis itself.
        const mixed = /\*\*/.test(row.value);
        return (
          <div className="tw-asst-row" key={`${keyPrefix}-${idx}`}>
            <span>{inline(row.label, `${keyPrefix}-${idx}-l`)}</span>
            <strong className={mixed ? "is-mixed" : ""}>
              {inline(row.value, `${keyPrefix}-${idx}-v`)}
            </strong>
          </div>
        );
      })}
    </div>
  );
}

export default function MessageBody({ text }) {
  const blocks = toBlocks(text);
  if (!blocks.length) return null;

  // Lead an applied-action reply with a result banner instead of a heading.
  const lead = blocks[0];
  const applied = lead?.kind === "h2" && APPLIED_TITLE.test(lead.text);
  const rest = applied ? blocks.slice(1) : blocks;

  return (
    <>
      {applied && (
        <div className="tw-asst-result">
          <CheckIcon size={16} />
          <strong>{lead.text}</strong>
        </div>
      )}
      {rest.map((block, idx) => {
        const key = `b${idx}`;
        switch (block.kind) {
          case "h2":
            return <h4 key={key}>{inline(block.text, key)}</h4>;
          case "h3":
            return <h5 key={key}>{inline(block.text, key)}</h5>;
          case "note":
            return (
              <div
                key={key}
                className={`tw-asst-note ${block.tone === "warn" ? "tw-asst-note--warn" : ""}`}
                role={block.tone === "warn" ? "status" : undefined}
              >
                {block.tone === "warn" && <AlertIcon size={15} />}
                <span>{inline(block.text, key)}</span>
              </div>
            );
          case "rows":
            return <Rows key={key} rows={block.rows} keyPrefix={key} />;
          case "list":
            return (
              <ul key={key}>
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`}>
                    {inline(item.text, `${key}-${i}`)}
                    {item.children.length > 0 && (
                      <ul>
                        {item.children.map((child, c) => (
                          <li key={`${key}-${i}-${c}`}>
                            {inline(child.replace(/^-\s+/, ""), `${key}-${i}-${c}`)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            );
          default:
            return <p key={key}>{inline(block.text, key)}</p>;
        }
      })}
    </>
  );
}
