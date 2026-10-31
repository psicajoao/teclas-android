import { useEffect, useMemo, useState } from 'react'

type Sec = { id: string; title: string; body: React.ReactNode }

const SECTIONS: Sec[] = [
  {
    id: 'comecar', title: 'Primeiros passos',
    body: (
      <>
        <p>O Palco Keys é um teclado de palco que roda no navegador do computador (Windows, macOS ou Linux), no Chrome ou no Edge. Você toca num teclado MIDI e escolhe, música por música, os timbres, as seções e os efeitos.</p>
        <ol>
          <li>Abra o endereço do Palco Keys no Chrome ou no Edge e entre com a sua conta.</li>
          <li>Toque em <b>Iniciar</b>. Isso liga o áudio e conecta o teclado MIDI.</li>
          <li>Se o navegador perguntar, permita o acesso ao MIDI.</li>
          <li>Toque uma tecla. Se ainda não tem teclado MIDI, dá para tocar pelo teclado da tela.</li>
        </ol>
        <p>Depois da primeira abertura, dá para instalar o Palco Keys pelo navegador (ícone de instalar na barra de endereço). Instalado, ele abre como um aplicativo e funciona até sem internet.</p>
        <p className="man-tip">Antes de tocar num culto ou show, ative o modo Foco do computador para não receber avisos durante o som.</p>
      </>
    ),
  },
  {
    id: 'midi', title: 'Conectar o teclado MIDI',
    body: (
      <>
        <p>Ligue o teclado por cabo USB (ou por Bluetooth MIDI) antes de abrir o app. O navegador mostra uma permissão de MIDI: aceite.</p>
        <ul>
          <li>Em <b>Menu › Configurações › MIDI</b> aparecem os dispositivos conectados e dá para tocar algumas teclas para ver se as notas chegam.</li>
          <li>Com <b>Todos os dispositivos</b> escolhido no teclado 1, tudo o que estiver conectado funciona junto.</li>
          <li>Trocou ou ligou o teclado depois de abrir o app? Use <b>Procurar de novo</b>.</li>
          <li>O botão <b>Testar MIDI</b>, na tela inicial, mostra as notas que o app está recebendo.</li>
        </ul>
        <p>Se aparecer "O MIDI foi bloqueado neste navegador", abra no Chrome e permita o acesso ao MIDI (cadeado na barra de endereço).</p>
      </>
    ),
  },
  {
    id: 'tela', title: 'A tela principal',
    body: (
      <>
        <ul>
          <li><b>Barra de cima:</b> andamento (BPM, com + e −, ou toque no Tap), metrônomo, gravador de pistas, compasso, transposição, volume do clique, volume geral e o botão PANIC.</li>
          <li><b>Lista de músicas (esquerda):</b> as músicas da lista escolhida e, abaixo, o Pad.</li>
          <li><b>Camadas (centro):</b> até 10 timbres tocando juntos, em duas páginas (1–5 e 6–10).</li>
          <li><b>Seções (embaixo das camadas):</b> partes da música, como Intro, Verso, Refrão, Ponte e Final.</li>
          <li><b>Teclado da tela:</b> com as rodas de Pitch e Mod ao lado.</li>
        </ul>
        <p>O botão <b>PANIC</b> silencia todo o som de uma vez. Use se alguma nota ficar presa.</p>
      </>
    ),
  },
  {
    id: 'camadas', title: 'Camadas e timbres',
    body: (
      <>
        <p>Cada camada é um timbre. Você pode tocar até 10 ao mesmo tempo (por exemplo, piano + cordas + pad).</p>
        <ol>
          <li>Toque no nome da camada ("Escolher timbre") para abrir a lista de timbres, organizada por famílias: Worship, Pianos, Órgãos, Cordas, Pads, Leads, Sintetizadores e outras. Os seus favoritos ficam em <b>Favoritos</b>.</li>
          <li>O botão redondo de cada camada liga e desliga a camada.</li>
          <li>O fader grande ajusta o volume da camada (o número aparece embaixo).</li>
          <li>Para tirar o timbre, abra a lista e toque em <b>Esvaziar camada</b>.</li>
        </ol>
        <p>Cada camada tem três quadradinhos: <b>MIDI</b> (efeitos que mexem nas notas), <b>Efeitos</b> (reverb, chorus, delay, pan) e <b>Som</b> (filtro, envelope, overdrive). Toque no nome para escolher e no pontinho para ligar ou desligar.</p>
        <p>O ícone de ajustes ao lado do nome abre o painel do som, com compressor, equalizador e ajustes: bloquear o pedal de sustain naquele timbre, transpor só aquele som, limitar o número de vozes e a faixa do fader.</p>
        <p>Segure (ou clique com o botão direito) numa camada para movê-la para outra posição.</p>
      </>
    ),
  },
  {
    id: 'secoes', title: 'Seções de uma música',
    body: (
      <>
        <p>Uma música é feita de seções. Cada seção guarda os seus próprios timbres, volumes e efeitos. Assim você troca tudo com um toque, do Verso para o Refrão.</p>
        <ul>
          <li>Toque numa seção para ir para ela. No teclado do computador, as teclas <b>1</b> a <b>8</b> escolhem a seção, e as setas <b>←</b> e <b>→</b> andam entre elas.</li>
          <li>Segure uma seção para renomear (até 14 letras), copiar e colar os timbres de uma seção em outra, mover para a esquerda ou direita, e definir o <b>tempo da troca de seção</b>, que vale para a música toda.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'musicas', title: 'Músicas e listas',
    body: (
      <>
        <ul>
          <li>O <b>+</b> ao lado de "Todas as músicas" cria uma música nova. Dê um nome, escolha o tom do Pad e monte as seções.</li>
          <li>Em cima das camadas ficam o nome da música, as setas ◀ ▶ para mudar de música, e os botões <b>Duplicar</b> e <b>Excluir música</b>.</li>
          <li>No teclado do computador, <b>Page Up</b> e <b>Page Down</b> trocam de música.</li>
          <li><b>Listas</b> (ao lado de "Todas as músicas") servem para montar o repertório do dia, por exemplo "Culto de domingo". A biblioteca guarda todas as músicas; cada lista escolhe e ordena as do dia. Toque nas músicas, na ordem em que quer tocar. Para reordenar, segure e arraste.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'pad', title: 'Pad contínuo',
    body: (
      <>
        <p>O Pad é um colchão de som que fica tocando enquanto você faz outras coisas, muito usado em louvor.</p>
        <ul>
          <li>Toque no botão redondo do Pad para ligar e desligar.</li>
          <li>Escolha o tom (C, C#, D, e assim por diante) e o timbre do Pad.</li>
          <li><b>Brightness</b> deixa o som mais brilhante ou mais escuro. <b>Shimmer</b> acrescenta um brilho de fundo.</li>
          <li><b>Entrada</b> define em quantos segundos o Pad aparece. <b>Manter nota</b> renova a nota de tempos em tempos, para sons que vão sumindo sozinhos.</li>
          <li>O fader ao lado ajusta o volume do Pad.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'efeitos', title: 'Efeitos e arpejador',
    body: (
      <>
        <p>Os três quadradinhos de cada camada trazem:</p>
        <ul>
          <li><b>MIDI:</b> arpejador (toca as notas que você segura em sequência, no tempo do metrônomo), oitavas e acordes.</li>
          <li><b>Efeitos:</b> reverb (espaço), chorus (alarga o som), delay (eco) e pan (esquerda ou direita).</li>
          <li><b>Som:</b> filtro, envelope (ataque e release) e overdrive.</li>
        </ul>
        <p>No arpejador você escolhe a divisão, o número de passos, as oitavas e se as notas ficam seguras com o <b>Segurar (latch)</b>, que continua tocando depois de soltar as teclas.</p>
      </>
    ),
  },
  {
    id: 'regioes', title: 'Regiões do teclado (divisões)',
    body: (
      <>
        <p>O botão <b>Regiões</b> mostra onde cada timbre toca no teclado. Dá para dividir o teclado: por exemplo, baixo na mão esquerda e piano com cordas na direita. Escolha os timbres das camadas e ajuste a região de cada um.</p>
        <p>O botão <b>Teclado</b> aumenta ou esconde o teclado da tela.</p>
      </>
    ),
  },
  {
    id: 'tempo', title: 'Metrônomo e andamento',
    body: (
      <>
        <ul>
          <li>Ajuste o BPM com + e −, digitando o número ou tocando no <b>Tap</b> no ritmo da música.</li>
          <li>O botão do metrônomo liga o clique. A tecla <b>M</b> também liga e desliga.</li>
          <li><b>E C D</b> escolhe de que lado sai o clique: esquerdo, centro ou direito. Isso é útil para mandar o clique só para o seu fone.</li>
          <li>Escolha o compasso (2, 3, 4 ou 6 tempos) e o volume do clique.</li>
          <li>A <b>transposição</b> sobe ou desce tudo em semitons, sem você mudar o que toca.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'gravador', title: 'Gravador de pistas',
    body: (
      <>
        <p>Grave o que você toca e toque por cima, em camadas, como um pequeno looper.</p>
        <ol>
          <li>Toque no <b>●</b> para gravar uma nova pista. O metrônomo faz uma contagem antes de começar.</li>
          <li>Toque de novo para parar. A pista fica guardada com o timbre da hora em que foi gravada.</li>
          <li>O <b>▶</b> toca todas as pistas em loop. Cada música guarda até 4 pistas.</li>
          <li>O botão com três linhas (≡) abre a lista de pistas: volume, mudo, apagar e quantização (<b>Q</b>), que acerta as notas na grade sem apagar o que você tocou.</li>
        </ol>
      </>
    ),
  },
  {
    id: 'midilearn', title: 'MIDI Learn: botões do seu controlador',
    body: (
      <>
        <p>Dá para comandar o app com botões, faders e knobs do seu teclado.</p>
        <ol>
          <li>Abra <b>Menu › MIDI Learn</b>.</li>
          <li>Toque num controle da tela (por exemplo, a seção 2, o volume geral ou o PANIC).</li>
          <li>Mexa no botão do controlador que vai comandá-lo. Pronto: tudo fica salvo automaticamente.</li>
        </ol>
        <p>Para cancelar, toque no controle de novo ou aperte Esc. Há um botão para apagar todos os controles ensinados.</p>
      </>
    ),
  },
  {
    id: 'atalhos', title: 'Atalhos do teclado do computador',
    body: (
      <table className="man-tab">
        <tbody>
          <tr><td><kbd>1</kbd> … <kbd>8</kbd></td><td>Escolher a seção 1 a 8</td></tr>
          <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Seção anterior / próxima</td></tr>
          <tr><td><kbd>Page Up</kbd> <kbd>Page Down</kbd></td><td>Música anterior / próxima</td></tr>
          <tr><td><kbd>M</kbd></td><td>Ligar e desligar o metrônomo</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Fechar a janela aberta</td></tr>
        </tbody>
      </table>
    ),
  },
  {
    id: 'audio', title: 'Áudio e atraso (latência)',
    body: (
      <>
        <p>Em <b>Menu › Configurações › Áudio</b> você vê o atraso estimado entre apertar a tecla e ouvir o som. Abaixo de uns 20 ms é excelente; até uns 40 ms ainda é bom para tocar ao vivo.</p>
        <ul>
          <li>Prefira fone ou caixas <b>com cabo</b> ou uma <b>interface de áudio USB</b>: têm o menor atraso.</li>
          <li>O áudio por <b>Bluetooth</b> costuma somar de 100 a 250 ms. Não é bom para tocar ao vivo.</li>
          <li>Se o som não sair, toque em "Acordar o áudio e tocar um Dó", na parte de diagnóstico.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'backup', title: 'Backup e outro computador',
    body: (
      <>
        <p>Em <b>Menu › Configurações</b> há <b>Exportar backup</b> e <b>Importar backup</b>. O arquivo leva as suas músicas, listas, pad, ajustes e controles MIDI para outro computador. Ele é salvo na pasta Downloads.</p>
        <p>Faça um backup de vez em quando, principalmente antes de trocar de computador ou limpar os dados do navegador.</p>
      </>
    ),
  },
  {
    id: 'conta', title: 'Conta, teste grátis e licença',
    body: (
      <>
        <ul>
          <li>Para usar o Palco Keys você cria uma conta com e-mail e senha. Se esquecer a senha, toque em <b>Esqueci a senha</b> na tela de entrada.</li>
          <li>O <b>teste grátis dura 7 dias</b> a partir da criação da conta. Dentro do app aparece um aviso com quantos dias faltam.</li>
          <li>Quando o teste termina, ao entrar você vê o aviso e, para continuar, precisa comprar a licença.</li>
          <li>A <b>licença é paga uma vez só</b> e vale para até 2 computadores. Use na compra o mesmo e-mail da sua conta: o acesso é liberado automaticamente.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'problemas', title: 'Problemas comuns',
    body: (
      <>
        <dl className="man-faq">
          <dt>Não sai som.</dt>
          <dd>Toque em Iniciar, confira o volume geral e o volume da camada, e veja se a camada está ligada. Em Configurações › Áudio, confira a saída de áudio.</dd>
          <dt>O teclado não toca.</dt>
          <dd>Veja se o navegador permitiu o MIDI e se o teclado aparece em Configurações › MIDI. Use Procurar de novo.</dd>
          <dt>Uma nota ficou presa.</dt>
          <dd>Aperte PANIC.</dd>
          <dt>O som tem atraso.</dt>
          <dd>Use fone com cabo ou interface USB, e evite Bluetooth.</dd>
          <dt>Troquei de computador e as músicas sumiram.</dt>
          <dd>Importe o backup feito no computador antigo, em Configurações.</dd>
          <dt>Este aparelho não é compatível.</dt>
          <dd>O Palco Keys é só para computador, no Chrome ou no Edge. Celulares e tablets não são aceitos.</dd>
        </dl>
      </>
    ),
  },
]

/** Manual de uso, dentro do app. Abre pelo menu. */
export function Manual({ onClose }: { onClose: () => void }) {
  const [id, setId] = useState(SECTIONS[0].id)
  const cur = useMemo(() => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0], [id])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const i = SECTIONS.findIndex((s) => s.id === cur.id)
  return (
    <div className="zmodal manual" role="dialog" aria-modal="true" aria-label="Manual">
      <header className="man-head">
        <h2>Manual do Palco Keys</h2>
        <button className="ghost" onClick={onClose}>Fechar</button>
      </header>
      <div className="man-wrap">
        <nav className="man-nav" aria-label="Assuntos do manual">
          {SECTIONS.map((s) => (
            <button key={s.id} className={s.id === cur.id ? 'on' : ''} onClick={() => setId(s.id)}>{s.title}</button>
          ))}
        </nav>
        <article className="man-body" key={cur.id}>
          <h3>{cur.title}</h3>
          {cur.body}
          <div className="man-pager">
            <button className="ghost" disabled={i === 0} onClick={() => setId(SECTIONS[i - 1].id)}>‹ Anterior</button>
            <button className="ghost" disabled={i === SECTIONS.length - 1} onClick={() => setId(SECTIONS[i + 1].id)}>Próximo ›</button>
          </div>
        </article>
      </div>
    </div>
  )
}
