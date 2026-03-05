interface AnnotationData {
  id: string;
  comment: string;
  element: string;
  elementPath: string;
  x: number;
  y: number;
  timestamp: number;
  selectedText?: string;
  intent?: 'fix' | 'change' | 'question' | 'approve';
  severity?: 'blocking' | 'important' | 'suggestion';
}

interface GenerateMarkdownOptions {
  title?: string;
  pageUrl?: string;
  includeMetadata?: boolean;
}

export function generateMarkdown(
  annotations: AnnotationData[],
  options: GenerateMarkdownOptions = {}
): string {
  const {
    title = 'Client Feedback',
    pageUrl = typeof window !== 'undefined' ? window.location.href : '',
    includeMetadata = true,
  } = options;

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];

  let md = `# ${title}\n\n`;
  md += `- **Pagina:** ${pageUrl}\n`;
  md += `- **Data:** ${dateStr} ${timeStr}\n`;
  md += `- **Total de anotacoes:** ${annotations.length}\n`;

  const blocking = annotations.filter((a) => a.severity === 'blocking').length;
  const important = annotations.filter((a) => a.severity === 'important').length;
  const suggestion = annotations.filter((a) => a.severity === 'suggestion').length;

  if (blocking || important || suggestion) {
    md += `- **Blocking:** ${blocking} | **Important:** ${important} | **Suggestion:** ${suggestion}\n`;
  }

  md += `\n---\n\n`;

  annotations.forEach((annotation, index) => {
    const num = index + 1;
    const intentLabel = annotation.intent ? ` [${annotation.intent.toUpperCase()}]` : '';
    const severityLabel = annotation.severity ? ` (${annotation.severity})` : '';

    md += `## ${num}. ${annotation.comment}${intentLabel}${severityLabel}\n\n`;
    md += `- **Elemento:** \`${annotation.element}\`\n`;
    md += `- **Caminho:** \`${annotation.elementPath}\`\n`;

    if (annotation.selectedText) {
      md += `- **Texto selecionado:** "${annotation.selectedText}"\n`;
    }

    if (includeMetadata) {
      const ts = new Date(annotation.timestamp).toLocaleTimeString();
      md += `- **Hora:** ${ts}\n`;
      md += `- **Posicao:** (${Math.round(annotation.x)}, ${Math.round(annotation.y)})\n`;
    }

    md += `\n`;
  });

  return md;
}

export function downloadMarkdown(
  annotations: AnnotationData[],
  options: GenerateMarkdownOptions = {}
): void {
  const md = generateMarkdown(annotations, options);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `feedback-${dateStr}.md`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyMarkdownToClipboard(
  annotations: AnnotationData[],
  options: GenerateMarkdownOptions = {}
): Promise<void> {
  const md = generateMarkdown(annotations, options);
  return navigator.clipboard.writeText(md);
}
