/**
 * Renders the registry's markdown-ish plain text (lib/content/documents.ts
 * format) without a markdown dependency:
 *   "## Heading"        → <h2>
 *   blank line          → paragraph break
 *   consecutive "- ..." → <ul><li>
 *   single "\n"         → <br /> inside a paragraph (verses, letter blocks)
 * Server component; also used for knowledge section bodies (which contain no
 * headings). The caller supplies the wrapping typography class.
 */

type Block =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; lines: string[] };

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split(/\n\s*\n/)) {
    const chunk = raw.trim();
    if (!chunk) continue;
    if (chunk.startsWith("## ")) {
      blocks.push({ type: "heading", text: chunk.slice(3).trim() });
      continue;
    }
    const lines = chunk.split("\n").map((l) => l.trim());
    if (lines.every((l) => l.startsWith("- "))) {
      blocks.push({ type: "list", items: lines.map((l) => l.slice(2).trim()) });
      continue;
    }
    blocks.push({ type: "paragraph", lines });
  }
  return blocks;
}

export function DocumentBody({ text }: { text: string }): React.ReactElement {
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "heading") return <h2 key={i}>{block.text}</h2>;
        if (block.type === "list") {
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {line}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}
