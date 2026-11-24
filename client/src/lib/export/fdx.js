import { readScript } from './script.js';

/**
 * Final Draft .fdx — the format the industry actually passes around.
 *
 * It is plain XML, and the Type strings are matched literally by Final
 * Draft, so they have to be exactly these.
 */
const FDX_TYPE = {
  scene: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  paren: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // XML 1.0 forbids most control characters outright.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export function toFdx(doc, { title, author } = {}) {
  const blocks = readScript(doc).filter((block) => block.text);

  const paragraphs = blocks
    .map((block) => {
      const type = FDX_TYPE[block.element] || 'Action';
      return `    <Paragraph Type="${type}">\n      <Text>${escapeXml(block.text)}</Text>\n    </Paragraph>`;
    })
    .join('\n');

  const titlePage =
    title || author
      ? `  <TitlePage>
    <Content>
      <Paragraph Alignment="Center"><Text>${escapeXml(title || '')}</Text></Paragraph>
      <Paragraph Alignment="Center"><Text></Text></Paragraph>
      <Paragraph Alignment="Center"><Text>Written by</Text></Paragraph>
      <Paragraph Alignment="Center"><Text></Text></Paragraph>
      <Paragraph Alignment="Center"><Text>${escapeXml(author || '')}</Text></Paragraph>
    </Content>
  </TitlePage>\n`
      : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
  <Content>
${paragraphs}
  </Content>
${titlePage}</FinalDraft>
`;
}
