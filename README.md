# WhatsApp Scheduler PRO 🚀

Um agendador de mensagens para WhatsApp web robusto, com interface moderna e proteção contra duplicação de envios.

## ✨ Recursos

- **Prevenção de Duplicação**: Índice único no banco de dados impede reenvios para o mesmo contato no mesmo dia.
- **Variáveis de Mensagem**: Personalize com `[NOME]`, `[SOBRENOME]`, `[SAUDACAO]` e `[DIA_DA_SEMANA]`.
- **Filtros de Contato**: Filtre contatos por Emoji (ex: 🟢) ou Sufixo no nome (ex: `////`).
- **Filtro de Regras**: Barra de busca e toggle Todas / Ativas / Inativas no painel.
- **Interface Premium**: Dashboard com React, Tailwind CSS e Framer Motion.
- **Delay Anti-Ban**: Intervalo fixo de 30s entre mensagens para proteger sua conta.
- **Reconectar / Desconectar**: Reconectar mantém sessão; Desconectar limpa e gera novo QR Code.
- **Limpar Regras**: Botão dedicado para apagar todas as regras e a fila de uma vez.
- **Limpar Fila**: Botão dedicado para limpar apenas a lista de envio (mantém as regras).
- **Docker Ready**: Deploy simplificado via Docker Compose.

## 🛠️ Tecnologias

- **Frontend**: React.js, Vite, Tailwind CSS, Lucide React, Axios, Socket.io
- **Backend**: Node.js, Express, SQLite3, WhatsApp-web.js, Socket.io
- **DevOps**: Docker, Docker Compose

## 📦 Como Instalar e Rodar

### Pré-requisitos

- Docker e Docker Compose instalados.

### Passo a Passo

1. **Clone o repositório**:

   ```bash
   git clone https://github.com/seu-usuario/whatsapp_agendamento.git
   cd whatsapp_agendamento
   ```

2. **Inicie com Docker**:

   ```bash
   docker-compose up --build -d
   ```

3. **Acesse o Painel**: [http://localhost:3005](http://localhost:3005)

4. **Escaneie o QR Code** com seu WhatsApp para autenticar.

## ⚙️ Configuração de Regras

| Campo | Descrição | Exemplo |
|---|---|---|
| Nome | Identificação da regra | `Bom dia Clientes` |
| Horário | Hora de disparo (SP) | `08:00` |
| Emoji | Emoji no nome do contato | `🟢` |
| Sufixo | Texto no final do nome | `////` |
| Mensagem | Texto com variáveis | `Olá [NOME], [SAUDACAO]!` |

### Variáveis disponíveis na mensagem

| Variável | O que insere | Exemplo |
|---|---|---|
| `[NOME]` | Primeiro nome do contato | `João` |
| `[SOBRENOME]` | Último sobrenome (ignora emojis/sufixos) | `Silva` |
| `[SAUDACAO]` | Saudação conforme o horário | `Bom dia` |
| `[DIA_DA_SEMANA]` | Dia da semana em português | `segunda-feira` |

> Ao editar uma regra, ela é liberada para disparar novamente no próximo ciclo do horário agendado.

## 🔒 Segurança (GIT)

A sessão do WhatsApp e o banco de dados ficam em `backend/database/`, excluída do Git pelo `.gitignore`.

---

Desenvolvido por Ricieri30 e Antigravity.
