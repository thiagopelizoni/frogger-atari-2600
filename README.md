# FROGGER 2600

Recriação de Frogger, o cartucho que Ed English programou para a Parker Brothers em 1982, sob licença da Sega, para jogar no navegador. O sapo sai da calçada, atravessa cinco pistas de trânsito e um rio de troncos, tartarugas e jacarés e entra numa das cinco tocas do outro lado. Feito em JavaScript puro, jogável offline, com teclado, toque ou gamepad.

O jogo reproduz o cartucho quadro a quadro: a mesma ordem de rotinas a cada 1/60 s, as mesmas tabelas de velocidade, os mesmos desenhos, as mesmas cores e o mesmo som, gerado por uma imitação dos dois canais de áudio do console. Até o pisca-pisca do original está lá: nas fileiras em que o sapo, a rã-dama ou a cobra aparecem, o Atari alterna esses personagens com os carros e os troncos de um quadro para o outro.

## Como jogar

Abra [index.html](index.html) diretamente no navegador ou use [dist/frogger-2600.html](dist/frogger-2600.html), que reúne o jogo inteiro em um único arquivo HTML. As duas versões funcionam offline, sem instalação.

Para executar o servidor local, use Node.js 20 ou superior:

```bash
npm start
```

Abra `http://127.0.0.1:3000`. As variáveis `PORT` (padrão `3000`) e `HOST` (padrão `127.0.0.1`) mudam a porta e o endereço do servidor, por exemplo `PORT=8080 HOST=0.0.0.0 npm start`.

O console liga na seleção de jogo, com a música-tema tocando e o trânsito já andando. Aperte Enter ou GAME RESET para começar: a música de abertura toca por cerca de 7 segundos e o sapo parte quando ela acaba.

### Controles

| Controle | Ação |
| --- | --- |
| ← ↑ → ↓ ou W A S D | Um pulo na direção. Nos jogos 1 a 4, solte e empurre de novo para cada pulo; nos jogos 5 e 6, segurar repete o pulo a cada 8 quadros |
| Espaço / Z / X | Botão vermelho: no fim de jogo, joga de novo o mesmo jogo |
| Enter | GAME RESET na seleção e no fim de jogo; durante a partida, pausa e continua |
| R | GAME RESET: começa a partida de novo |
| 1 a 6 (também no teclado numérico) | Escolhe o jogo, como apertar GAME SELECT até ele |
| L | Alavanca de dificuldade esquerda (jogador 1), B ou A |
| Ç (; no teclado americano) | Alavanca de dificuldade direita (jogador 2), B ou A |
| P | Pausa e continua |
| M | Liga e desliga o som |
| C | TV colorida ou preto e branco |
| F | Tela cheia, onde o navegador oferece; sem esse recurso, a tecla não faz nada e o botão TELA CHEIA some |

O joystick é lido em quadros alternados, como no cartucho; um toque mais curto que isso fica guardado até a leitura seguinte e vale uma vez. Empurrar duas direções ao mesmo tempo não faz nada, e trocar de direção sem soltar já conta como um empurrão novo. Depois de clicar em qualquer botão da página, o teclado volta para a tela do jogo, então Enter e Espaço continuam controlando a partida.

No celular, use o direcional e o botão vermelho. Na seleção de jogo, tocar na tela ou no botão vermelho aperta GAME RESET; no cartucho só a chave começa a partida, e o atalho existe porque no toque as chaves ficam pequenas. Com o aparelho deitado, o direcional fica à esquerda da tela, o botão vermelho à direita e as cinco chaves do console numa faixa logo abaixo. Onde o navegador oferece tela cheia, o botão TELA CHEIA leva o direcional e o botão vermelho junto com o televisor. No gamepad, use o manche esquerdo ou o direcional, um dos botões de ação (A, B, X ou o gatilho direito) como botão vermelho e START como Enter. Ao sair da janela ou trocar de aba, a partida pausa e os comandos são soltos; no toque, tocar na tela retoma.

Quando o navegador mostra menos quadros por segundo do que os 60 do console, a página mistura os dois últimos quadros como o brilho remanescente de um tubo de TV, para que nada que pisca desapareça. Com 60 Hz ou mais, cada quadro aparece como o console o desenhou.

## Os seis jogos

A chave GAME SELECT percorre os jogos de 1 a 6 e mostra o número no alto da tela. Nas tocas aparecem rostos de sapo: um na toca do meio para os jogos de um jogador, dois nas tocas 2 e 4 para os de dois jogadores.

| Jogo | Jogadores | Começo |
| --- | --- | --- |
| 1 | Um | Fase 1 |
| 2 | Dois, alternados | Fase 1 |
| 3 | Um | Fase 3 |
| 4 | Dois, alternados | Fase 3 |
| 5 | Um | Fase 1, Speedy Frogger |
| 6 | Dois, alternados | Fase 1, Speedy Frogger |

Os jogos 3 e 4, os "mais difíceis" do manual, usam as mesmas regras e tabelas que os outros e apenas começam na fase 3. Os jogos 5 e 6 só mudam o joystick: segurar a direção repete o pulo.

Nos jogos de dois jogadores o da esquerda começa. Cada um tem placar, sapos, fase e tocas próprios e usa a sua alavanca de dificuldade. A vez passa quando um sapo se perde (chegar em casa não passa a vez); se o outro jogador não tem mais sapos, o mesmo continua. O placar do jogador 2 aparece mais à direita no alto da tela. Aqui os dois jogadores usam os mesmos controles, um de cada vez.

## Regras

Os números abaixo são os do cartucho e estão no motor (`js/config.js`, `js/world.js` e `js/game.js`). O console conta o tempo em quadros de 1/60 s.

### A tela

- No alto fica o placar, com até quatro dígitos e sem zeros à esquerda. Logo abaixo, a cerca viva com as cinco tocas.
- Depois vêm cinco fileiras de rio, a margem amarela, cinco pistas de estrada e a calçada, onde cada sapo começa.
- Embaixo, à esquerda, um quadradinho branco por sapo de reserva; à direita, a faixa de tempo, preta, que fica vermelha no fim.
- Os objetos entram e saem pelas bordas da tela e dão a volta: tudo o que sai de um lado reaparece do outro.

### O sapo

- Cada pulo é instantâneo: 8 px para o lado ou uma fileira para a frente ou para trás.
- Nas laterais, o pulo só acontece se o sapo ficar entre x 6 e x 146. Para trás da calçada não há pulo.
- Na estrada, encostar em carro ou caminhão mata. A calçada e a margem são seguras, a não ser pela cobra da margem.
- No rio o sapo precisa estar sobre um tronco, uma tartaruga ou o corpo do jacaré; fora deles, cai na água. Sobre eles, é levado junto, pixel a pixel.
- O cartucho considera um pixel a mais à direita de cada objeto. Por isso o sapo fica seguro no vão entre as tartarugas de um mesmo grupo, que estão a 16 px umas das outras, mas cai na água entre um grupo e outro e entre um tronco e outro.
- Com a alavanca do jogador em A, o sapo levado até x 147 ou além, ou abaixo de x 4, se perde. Em B ele dá a volta junto com o objeto e reaparece do outro lado.

### As tocas

- Do rio de cima, um pulo para a frente tenta entrar numa toca. Ele só entra se estiver alinhado com a abertura: x de 11 a 18 na primeira toca, e a mesma janela de 8 px a cada 32 px nas outras. Fora delas, bate no arbusto e se perde.
- Uma toca ocupada não deixa entrar: o pulo não acontece e o sapo continua no rio.
- De tempos em tempos, um visitante aparece numa toca vazia. Nas fases ímpares é uma mosca, que fica 157 quadros (cerca de 2,6 s) e vale 20 pontos para quem entrar na toca. Nas fases pares é um jacaré: durante 157 quadros só aparecem os olhos e o focinho e dá para entrar sem bônus; nos 157 seguintes a cabeça inteira está fora da água e entrar mata.
- Entre um visitante e o próximo passam de 514 a 1.023 quadros, conforme o contador de quadros do console no momento em que o anterior saiu. Se o sapo entra na toca do visitante, o próximo vem mais cedo.
- Quando um sapo entra numa toca, duas pistas vizinhas da estrada voltam à posição inicial. O desenho dessas pistas só se atualiza quando elas andam de novo, então por um instante os carros ainda aparecem no lugar antigo.
- O próximo sapo sai da calçada 9 quadros depois de um chegar em casa.

### O rio

- Duas fileiras têm tartarugas, em grupos de três (perto da margem) e de dois (a quarta fileira). Em cada uma, só o segundo grupo mergulha.
- O mergulho segue um ciclo de 1.024 quadros (cerca de 17 s), em quatro etapas de 256 quadros: tartaruga vermelha, azul, debaixo da água e azul de novo. A azul ainda segura o sapo; debaixo da água ela não segura e o sapo se afoga. As duas fileiras estão defasadas em uma etapa.
- A segunda fileira tem troncos curtos de 16 px; a terceira, um tronco de 64 px; a primeira e a quinta, troncos de 32 px.
- Da fase 2 em diante, um dos troncos da quinta fileira, logo abaixo das tocas, vira um jacaré de 32 px que abre e fecha a boca a cada 64 quadros. O dorso e a cauda carregam o sapo; a cabeça, de 22 a 32 px à direita da ponta do jacaré, mata, com a boca aberta ou fechada.
- A rã-dama aparece em um de cada dois passos do primeiro tronco curto pela borda esquerda. Ela pula pelo tronco a cada 64 quadros, 8 px para a frente, para a frente, para trás e para trás. Basta encostar nela (até 5 px à esquerda ou 6 px à direita) para que ela suba no sapo, que fica amarelado. Se o sapo chegar em casa com ela, ganha mais 20 pontos; se morrer, ela se perde.

### As cobras

- Da fase 4 em diante, uma cobra de 16 px rasteja pela margem para a direita. Só a cabeça morde: de 7 a 14 px depois da ponta esquerda dela.
- Da fase 5 em diante, uma cobra sobe no tronco comprido em uma de cada duas passagens dele pela borda. Ela rasteja até perto da ponta do tronco, dá meia-volta e para enquanto o tronco a carrega, e se vira de novo perto da outra ponta. Ela morde pelo lado para onde está virada: chegar por trás é seguro.

### Tempo, vidas e fim

- Cada sapo tem 30 unidades de tempo de 64 quadros. Como o relógio do cartucho conta pelo contador geral de quadros, o tempo total varia de 1.857 a 1.920 quadros (cerca de 31 a 32 segundos). A faixa encolhe um pixel por unidade e, com 6 unidades, fica vermelha e toca um aviso. No fim, o sapo se perde.
- A partida começa com cinco sapos: um em jogo e quatro de reserva.
- Toda morte, seja atropelamento, água, tartaruga, jacaré, cobra, arbusto ou tempo, mostra o mesmo X verde no lugar do sapo, com o mesmo som, por 71 quadros. O trânsito e o rio continuam andando.
- Sem sapos, a partida acaba: a música-tema toca, o sapo some, o placar fica na tela e o trânsito da fase 4 passa ao fundo. O botão vermelho joga de novo o mesmo jogo; nos jogos de dois jogadores o manual pede os dois botões juntos, e aqui o botão vermelho vale pelos dois.
- Parado na seleção de jogo por 7.680 quadros (128 s), o console também entra nessa demonstração.

### Pontuação

| Lance | Pontos |
| --- | ---: |
| Pular para uma fileira ainda não alcançada por aquele sapo | 1 |
| Sapo em casa | 5 |
| Cada unidade de tempo que sobrou ao chegar | 2 |
| Mosca na toca | 20 |
| Chegar com a rã-dama | 20 |
| Encher as cinco tocas | 99 |

- Voltar e avançar de novo não pontua: são no máximo 11 pontos de avanço por sapo.
- O manual fala em 100 pontos pelas cinco tocas, mas o cartucho soma 99. Com o último sapo chegando com todo o tempo, a fase termina com 5 + 60 + 99 = 164 pontos nesse lance.
- Cada vez que o dígito dos milhares muda, o jogador ganha um sapo, se tiver menos de quatro na reserva. O placar tem quatro dígitos e volta a zero depois de 9.999, o que também conta como milhar novo.

### Fases

- Encher as cinco tocas toca uma música e passa de fase: a música-tema nas fases ímpares e a de abertura nas pares. As tocas se esvaziam quando o próximo sapo sai.
- Da fase 11 em diante as velocidades e o desenho das fileiras repetem os das fases 1 a 10, mas o jacaré e as duas cobras continuam.
- Cada fileira anda 1 px por quadro, a cada 2, a cada 4 ou a cada 8 quadros, sempre junto com o contador de quadros. As velocidades, em px/s:

| Fase | Pista 1 | Pista 2 | Pista 3 | Pista 4 | Caminhões | Margem | Rio 1 | Rio 2 | Rio 3 | Rio 4 | Rio 5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 15 | 7,5 | 7,5 | 15 | 7,5 | 30 | 15 | 30 | 15 | 30 | 30 |
| 2 | 30 | 15 | 15 | 30 | 15 | 60 | 30 | 15 | 30 | 15 | 15 |
| 3 | 15 | 30 | 15 | 30 | 15 | 60 | 30 | 30 | 60 | 15 | 30 |
| 4 | 60 | 30 | 15 | 30 | 60 | 15 | 7,5 | 15 | 30 | 30 | 15 |
| 5 | 60 | 15 | 60 | 15 | 30 | 30 | 60 | 30 | 15 | 30 | 30 |
| 6 | 30 | 60 | 60 | 7,5 | 60 | 7,5 | 30 | 15 | 30 | 15 | 7,5 |
| 7 | 60 | 30 | 15 | 30 | 60 | 15 | 7,5 | 15 | 30 | 30 | 15 |
| 8 | 30 | 15 | 15 | 30 | 15 | 60 | 30 | 15 | 30 | 15 | 15 |
| 9 | 30 | 60 | 60 | 7,5 | 60 | 7,5 | 30 | 15 | 30 | 15 | 7,5 |
| 10 | 15 | 60 | 30 | 15 | 60 | 15 | 15 | 7,5 | 15 | 30 | 30 |

A pista 1 é a da calçada e o rio 1 o da margem. As pistas 1 e 3, os caminhões e as duas fileiras de tartarugas (rios 1 e 4) andam para a esquerda; as outras fileiras, para a direita. A estrada fica mais cheia com as fases: cada pista de carros tem de dois a seis carros, conforme a fase, e os caminhões são sempre dois. A margem só importa a partir da fase 4, quando a cobra aparece.

## Estrutura

- `index.html` e `css/style.css`: página, TV, chaves do console, manual, estados acessíveis e controles de toque.
- `js/config.js`: paleta NTSC, tabelas de cor do cartucho (colorida e preto e branco), fileiras, máscaras de velocidade e tamanhos por fase, jogos, efeitos sonoros e músicas.
- `js/sprites.js`: os desenhos de 8 pixels por linha, como o cartucho os guarda: sapo, rã-dama, carros, caminhão, tronco, tartaruga, jacaré, cobras, visitantes das tocas e dígitos.
- `js/world.js`: as fileiras, o movimento pelas máscaras e a colisão com a aritmética do cartucho.
- `js/game.js`: o jogo, independente do DOM, um quadro por vez: colisões, tempo, visitantes, rã-dama, cobras, driver de som, chaves do console, joystick e trânsito.
- `js/screen.js`: o desenho de cada quadro, linha por linha como o kernel de vídeo do console, com a alternância de quadros pares e ímpares, as bordas e os traços do HMOVE.
- `js/audio.js`: os dois canais de som do console (onda quadrada e ruído polinomial de 9 bits), alimentados quadro a quadro com os registradores que o jogo escreve.
- `js/input.js`: teclado, botões, vários toques e Gamepad API. Guarda os apertos mais curtos que um quadro e solta os comandos ao perder o foco.
- `js/main.js`: o laço de 60 quadros por segundo, a tela, as chaves, o recorde e a barra de estado.
- `tools/build-artifact.js`: gera o HTML portátil em `dist/`.
- `tools/serve.js`: servidor estático local, sem dependências.
- `tools/test.js`, `tools/test-play.js` e `tools/browser-test.js`: testes das regras, partidas jogadas só pelos controles e o jogo no Chromium.

## Desenvolvimento

Os testes do motor usam só o Node.js:

```bash
npm test
npm run test:play
```

`npm test` confere as regras uma a uma: janelas das tocas, pontuação, visitantes, rã-dama, cobras, jacaré, tartarugas, tempo, pausas, Speedy Frogger, alavancas de dificuldade, dois jogadores, GAME SELECT, som e as cores do quadro desenhado. `npm run test:play` liga o console, aperta GAME RESET e joga as fases 1 a 6 só com o joystick, escolhendo cada pulo depois de testá-lo numa cópia do jogo, e repete a partida para conferir que o resultado é o mesmo. `node tools/test-play.js N JOGO` joga N fases (de 1 a 12) do jogo 1, 3 ou 5; o robô passa as 12 fases nos jogos 1 e 5.

Para os testes no Chromium, instale as dependências de desenvolvimento e o navegador:

```bash
npm ci
npx playwright install chromium
npm run test:browser
```

Eles conferem as cores do quadro, teclado, toques mais curtos que um quadro, foco dos botões, pausa, alavancas, TV em preto e branco, recorde, fim de jogo, gamepad (inclusive bloqueado pela página), toque, layout com o celular em pé e deitado, tela cheia (com a API padrão, só com a prefixada e sem nenhuma) e o HTML offline. As capturas ficam em `test-results/`.

Depois de alterar o jogo, atualize o HTML portátil:

```bash
npm run build
```

## Sobre a recriação

Frogger chegou aos fliperamas em 1981, desenvolvido pela Konami e lançado pela Sega. No ano seguinte a Parker Brothers lançou a versão para o Atari 2600 (modelo PB5300), programada por Ed English, que vendeu milhões de cartuchos e virou um dos jogos mais populares do console.

As regras, os tempos, as velocidades, as posições, os desenhos, as cores e os sons desta versão foram medidos no cartucho original rodando em emulador, quadro a quadro e com leitura da memória do console, e conferidos com o código do próprio cartucho e com o manual. Onde o manual e o cartucho divergem, vale o que o cartucho faz: os 99 pontos das cinco tocas, o tempo de cerca de 32 segundos em vez de 30 e um único X verde para todas as mortes. Duas coisas não puderam ser vistas na tela e seguem o código do cartucho: a posição do placar do jogador 2 e a do número do jogo na seleção. Uma ficou de fora de propósito: depois de uns três minutos parado no fim de jogo, o cartucho passa a trocar a paleta inteira lendo bytes quaisquer da memória como cores, e aqui a demonstração mantém as cores normais.

Fontes:

- [Manual do Frogger no AtariAge](https://atariage.com/manual_html_page.php?SoftwareLabelID=194)
- [Frogger na Wikipédia em inglês](https://en.wikipedia.org/wiki/Frogger)
- [Frogger (modelo PB5300) no Arcade History](https://www.arcade-history.com/game/50505/frogger-model-pb5300)

Esta é uma recriação independente, sem afiliação com a Parker Brothers, a Sega ou a Konami.
