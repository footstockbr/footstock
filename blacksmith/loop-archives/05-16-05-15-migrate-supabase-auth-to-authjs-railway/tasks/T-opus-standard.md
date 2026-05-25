---
description: Bucket T-opus-standard - preparo (001) + finalizacao (009) do loop 05-16-05-15-migrate-supabase-auth-to-authjs-railway
model: opus
effort: standard
scope: project
mode_support:
- write
---

# Bucket T-opus-standard

Itens deste bucket:
- 001 - preparo (carregar contexto antes da iteracao)
- 009 - finalizacao (consolidar review, postar lista final dos 9 usuarios DEV, abrir ONDA-2-BACKLOG.md)

## Iteration template

```
/loop:iteraction:execute-task {task_path}
```

Para finalizacao, encadeia ainda:
```
/clear
/loop:iteraction:review-executed-loop --name 05-16-05-15-migrate-supabase-auth-to-authjs-railway
/clear
python3 ai-forge/scripts/generate-workflow-index.py
```

## Criterios de aceite do bucket

- Preparo: agente confirma leituras obrigatorias (source.md, _LOOP-CONFIG.json, CLAUDE.md Tier 1) sem editar codigo.
- Finalizacao: 5 smoke E2E prod verdes, Sentry `path: 'authjs'` em 100% dos logins, lista postada, ONDA-2-BACKLOG.md criado, `generate-workflow-index.py` re-executado sem drift.
