# Palco Keys para iPad (casca nativa)

O mesmo app web, embrulhado num app de iPad. Ganho: o teclado MIDI é lido direto pelo iOS (CoreMIDI),
sem o "WebMIDI Browser". Não é compilável no Linux: precisa de um Mac com Xcode.

## Passo a passo (no Mac)
1. Instale o **Xcode** (App Store) e o **Node** (nodejs.org), se ainda não tiver.
2. Abra o Terminal e baixe o projeto: `git clone https://github.com/psicajoao/teclas-android` e entre na pasta `teclas-android`.
3. Instale as dependências do app: `npm install`
4. Entre na casca: `cd palco-ios` e rode `npm install`
5. Gere e copie o app: `npm run sync`
6. Abra no Xcode: `npm run abrir`
7. No Xcode: clique em **App** (topo da lista à esquerda) > aba **Signing & Capabilities** > marque *Automatically manage signing* e escolha seu **Team** (seu Apple ID).
8. Ligue o iPad no Mac por cabo, escolha o iPad no menu de destino (topo) e clique em ▶ (Run).
9. No iPad, na primeira vez: Ajustes > Geral > VPN e Gerenciamento de Dispositivo > confie no seu Apple ID.

Com Apple ID gratuito o app vale por 7 dias (depois reinstale pelo Xcode). Para distribuir de verdade: conta de desenvolvedor (US$ 99/ano).

## O que existe aqui
- `ios/App/App/PalcoMidi.swift`: plugin CoreMIDI (lê controladores USB/Bluetooth, plugar e desplugar a quente; ajusta o áudio para buffer curto).
- `../src/nativemidi.ts`: faz `navigator.requestMIDIAccess` funcionar dentro do app, então o app web não muda.
- O build usa a versão de teste (`VITE_ALLOW_IPAD=1`): só contas admin entram, qualquer aparelho.

## Pontos NÃO testados (escritos sem Xcode)
O Swift pode dar algum erro de compilação pequeno; me mande a mensagem do Xcode que eu corrijo.
