# Projeto MuWeb — MU Online Main 5.2 → Web

**Versão publicada:** R90 FIX154 (**candidata de desenvolvimento**, não homologada como portabilidade completa).

Este repositório contém a **source Web** da portabilidade parcial. A Data do cliente e os serviços de jogo externos não estão incluídos. Código, efeitos, mapas, itens, pets e jogabilidade continuam em evolução; testes de código não equivalem à validação visual no cliente real.

## Executar no Windows

1. Instale **Node.js com npm** e extraia a source preservando suas pastas.
2. Execute `INSTALAR_DEPENDENCIAS.bat` na raiz, caso as dependências ainda não estejam instaladas.
3. Execute `INICIAR_MUWEB.bat` para verificar a source e iniciar o runtime.
4. Para encerrar o runtime iniciado pela source, use `PARAR_MUWEB.bat`.

O inicializador atual exige a Data compatível em `C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data` no PC Windows. Esse caminho é uma configuração atual da source: não é criado pelo GitHub. O GameServer e os demais serviços externos devem ser configurados separadamente.

## Organização

| Caminho | Conteúdo |
| --- | --- |
| `core/`, `game/`, `world/`, `graphics/`, `assets/` | Engine, gameplay, mapas e renderização |
| `ui/`, `ui2/`, `data/`, `skills/` | Interface, dados, Lua e skills |
| `network/`, `protocol/`, `database/` | Rede e protocolos |
| `tools/` | Inicialização, verificação e ferramentas necessárias |
| `docs/` | Documentação técnica e pendências |
| `CHANGELOG.md` | Histórico acumulativo da publicação |
| `RELEASE_CURRENT.txt` | Versão/estado atual |

A raiz contém apenas os pontos de entrada, metadados e arquivos indispensáveis. Capturas de depuração, manifestos históricos e cópias versionadas não devem ser publicados como source ativa.

## Estado e validação

A versão FIX154 contém verificadores como `tools/verify-fix154-runtime.mjs` e o runtime `tools/serve.mjs`. A validação física com WebGL, dados completos e GameServer permanece necessária. Consulte [pendências de portabilidade](docs/ENGINE/12_REMAINING_PORTS.md) antes de considerar um subsistema concluído.
