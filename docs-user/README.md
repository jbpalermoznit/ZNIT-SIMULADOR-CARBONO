# Documentação de usuário — ZNIT Simulador de Carbono

Documentação técnica voltada para o usuário final (cliente), publicada via **Mintlify**.

## Estrutura

```
docs-user/
├── mint.json              # config principal (cores, nav, branding)
├── logo.png               # logo no topbar
├── favicon.png            # favicon do site
├── images/                # screenshots e diagramas
├── introducao/
│   ├── bem-vindo.mdx      # landing
│   └── primeiros-passos.mdx
├── fluxo/
│   ├── importar-curva-abc.mdx
│   ├── entendendo-itens.mdx
│   ├── editar-fator.mdx
│   └── cenarios.mdx
├── analise/
│   └── visao-geral.mdx
└── referencia/
    └── glossario.mdx
```

## Desenvolvimento local

```bash
# instala CLI (uma vez)
npm install -g mintlify

# preview local com hot-reload
cd docs-user
mintlify dev

# abre em http://localhost:3000
```

Edite os `.mdx` e o navegador recarrega automaticamente.

## Deploy

A documentação é publicada pelo serviço hospedado da Mintlify (não pela Vercel).

### Primeira configuração

1. Crie conta em https://dashboard.mintlify.com (login via GitHub recomendado)
2. **Add deployment** → conecte o repositório `jbpalermoznit/ZNIT-SIMULADOR-CARBONO`
3. Em **Settings → Deployment Settings**, defina:
   - **Docs Directory**: `docs-user`
   - **Production Branch**: `main` (ou a branch que você usa para releases)
4. Salve. O Mintlify roda o build inicial e publica em uma URL `*.mintlify.app`.

### Domínio custom

Para usar `docs.simulador.znit.ai` (recomendado):

1. Mintlify dashboard → **Settings → Custom Domain** → adicione `docs.simulador.znit.ai`
2. Mintlify mostra os registros DNS a criar (geralmente um CNAME)
3. Adicione no GoDaddy (mesmo procedimento usado para `simulador.znit.ai`)
4. Aguarde verificação e provisionamento SSL (1–5 min)

### Atualizações

Toda vez que você fizer push para a branch de produção (`main` ou `feat/launch-prep` conforme configurado), o Mintlify reconstrói automaticamente — sem precisar fazer deploy manual.

## Convenções de escrita

- **PT-BR neutro profissional**. Você, sua. Sem gírias.
- Frases curtas; listas e tabelas quando ajudam.
- Componentes Mintlify (Cards, Steps, Tabs, Accordion, Tip, Warning, Note) — use para destacar fluxo e avisos.
- Imagens em `docs-user/images/` (PNG, ≤ 1 MB cada quando possível).

## Recursos da Mintlify usados

- `<Card>`, `<CardGroup>` — grids de funcionalidades
- `<Steps>` + `<Step>` — passo-a-passo numerado
- `<Tabs>` + `<Tab>` — alternativas paralelas
- `<AccordionGroup>` + `<Accordion>` — FAQ / casos
- `<Note>`, `<Tip>`, `<Warning>` — avisos contextuais

Documentação oficial dos componentes: https://mintlify.com/docs

## TODO

- [ ] Adicionar screenshots reais nas páginas (substituir referências textuais)
- [ ] Página de Relatórios/Exportações quando o PDF do memorando estiver pronto
- [ ] Vídeo curto (1-2 min) demonstrando o fluxo end-to-end
- [ ] Versão em inglês quando expandir para clientes fora do Brasil
