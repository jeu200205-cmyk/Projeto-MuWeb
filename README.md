# Projeto MuWeb

Portabilidade em desenvolvimento do **MU Online Main 5.2 para Web**. Este repositório disponibiliza a source Web ativa, preservando os módulos do jogo e a documentação técnica. A portabilidade ainda é parcial; o código publicado não implica homologação completa de mapas, modelos, efeitos ou jogabilidade.

## Executar no Windows

1. Instale o Node.js com npm.
2. Extraia a source completa e configure os dados compatíveis do cliente e os servidores externos.
3. Execute `INSTALAR_DEPENDENCIAS.bat` caso as dependências ainda não estejam instaladas.
4. Inicie com `INICIAR_MUWEB.bat` e encerre com `PARAR_MUWEB.bat`.

O cliente usa a Data configurada pelo inicializador da source atual. Data, GameServer e outros serviços externos **não** estão incluídos neste repositório.

## Organização

| Caminho | Conteúdo |
| --- | --- |
| `core/`, `world/`, `assets/`, `graphics/` | Engine, terreno, modelos e renderização |
| `game/`, `data/`, `skills/` | Gameplay, entidades, itens e habilidades |
| `ui/`, `ui2/`, `social/` | Interface e controles |
| `network/`, `protocol/`, `database/` | Comunicação e protocolos |
| `tools/` | Ferramentas de preparação, execução e verificação |
| `docs/` | Documentação e itens pendentes |
| `CHANGELOG.md` | Histórico **acumulativo** de alterações |

## Atualizações

O código é publicado com nomes de entrada estáveis e commits descritivos, sem usar a numeração interna de desenvolvimento como título da publicação. Consulte o [changelog](CHANGELOG.md) para acompanhar as alterações, incluindo o histórico anterior, e `docs/ENGINE/12_REMAINING_PORTS.md` para ver pendências registradas.

Para atestar correção visual, FPS, modelos, movimentação e conexão, ainda é necessário testar a source com dados reais no ambiente de execução.
