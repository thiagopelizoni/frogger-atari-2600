# FROGGER 2600

Recriação de Frogger, o cartucho da Parker Brothers de 1982 para o Atari 2600, jogável no navegador. O sapo sai da calçada, atravessa cinco pistas e cinco correntes e entra numa das cinco tocas. Feito em JavaScript puro, sem servidor obrigatório: o `index.html` abre direto do disco.

## Como jogar

Abra [index.html](index.html) no navegador. Os scripts são clássicos, então a página funciona em `file://`.

Para servir localmente, com Node.js 20 ou superior:

```bash
npm start
```

A página fica em `http://127.0.0.1:3000`. `PORT` e `HOST` mudam o endereço.

### Controles

| Controle | Ação |
| --- | --- |
| Setas ou WASD | Um pulo. Nos jogos 1 a 4, solte e aperte de novo. Nos jogos 5 e 6, segurar repete. |
| Enter ou botão vermelho | Começa. No fim de jogo, repete a mesma variação. |
| R ou GAME RESET | Recomeça a variação atual. |
| 1 a 6 ou GAME SELECT | Escolhe a variação. |
| L ou DIFFICULTY | Alterna B e A. |
| P | Pausa. |
| M | Som. |
| C | Cor ou preto e branco. |
| F | Tela cheia, quando o navegador permite. |

No toque, o direcional pula e o botão vermelho começa ou repete a partida.

## Variações

| Jogo | Modo |
| --- | --- |
| 1 | Iniciante, um jogador |
| 2 | Iniciante, dois jogadores |
| 3 | Avançado, um jogador: já começa na travessia mais difícil |
| 4 | Avançado, dois jogadores |
| 5 | Speedy Frogger, um jogador |
| 6 | Speedy Frogger, dois jogadores |

Nos jogos pares o jogador da esquerda começa. A vez troca quando um sapo se perde. Cada um tem placar e cinco sapos. A partida só acaba quando os dois ficam sem sapos.

## Regras

Os números são os do manual da Parker Brothers para o Atari 2600.

- A viagem começa com cinco sapos e trinta segundos. A faixa de baixo fica vermelha nos últimos cinco. No zero, o sapo se perde.
- A calçada e a margem são seguras. Encostar em carro ou caminhão mata. O sapo não nada: água aberta mata.
- Tronco, tartaruga que ainda não mergulhou, o vão entre as tartarugas de um mesmo grupo e o dorso ou a cauda do jacaré carregam o sapo. A boca do jacaré mata. Tartaruga que mergulha mata. Sair pela lateral de um tronco ou da ponta de um grupo de tartarugas cai na água.
- Na dificuldade A, ser levado para fora da tela mata. Na B, o sapo reaparece do outro lado. Ele não pula para fora por conta própria.
- Uma toca vazia, com o sapo alinhado na abertura, salva. Arbusto mata. Toca ocupada não deixa entrar. Cabeça de jacaré na toca não é salvamento. A mosca na toca e a rã branca levada para casa dão bônus.
- Encher as cinco tocas passa de fase. O trânsito fica mais denso e mais rápido, o rio fica mais vazio e com velocidades misturadas, e surgem cobras. O corpo da cobra é seguro. A boca mata. Nas fases seguintes a cobra também anda nos troncos.
- Pontos: 1 à frente, 5 ao chegar, 100 com as cinco tocas, 20 pela rã, 20 pela mosca e 2 por segundo que ainda restava. Cada 1000 pontos dá um sapo extra somente enquanto restam menos de quatro.

## Testes

`npm test` roda as regras em `tools/test.js`, carregando os mesmos scripts do navegador. `node tools/browser-load.js` confere a carga sem `module` nem `require`. `node tools/launch.js` abre a página duas vezes num navegador, se o Playwright estiver instalado.
