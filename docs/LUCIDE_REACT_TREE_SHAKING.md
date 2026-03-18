`lucide-react` permanece com named imports.

Motivo:
- a documentação oficial do Lucide React informa que o pacote é ESM e tree-shakeable;
- com Vite, apenas os ícones importados entram no bundle final;
- portanto, não há ganho real em migrar para deep imports neste projeto.

Referência consultada via `ctx7`:
- `lucide.dev/guide/packages/lucide-react`
