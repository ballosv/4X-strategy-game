import './ui/styles.css';
import { SetupError, createGame } from './core/game';
import { refreshReports } from './core/systems/economy';
import { assets } from './render/assets';
import { GameView } from './ui/gameView';
import { loadGame } from './ui/session';
import { SetupScreen } from './ui/setup';

const app = document.getElementById('app')!;
// Sprites im Hintergrund laden; bis dahin (oder ohne Assets) wird prozedural gezeichnet
void assets.load();
let view: GameView | null = null;

function showSetup(): void {
  view?.destroy();
  view = null;
  app.replaceChildren();
  const setup = new SetupScreen({
    start(settings) {
      try {
        const state = createGame(settings);
        for (const p of state.players) refreshReports(state, p.id);
        startGame(state);
        return null;
      } catch (e) {
        if (e instanceof SetupError) return e.message;
        console.error(e);
        return 'Das Spiel konnte nicht erstellt werden.';
      }
    },
    load(slot) {
      const state = loadGame(slot);
      if (state) startGame(state);
      else alert('Spielstand konnte nicht geladen werden.');
    },
  });
  app.append(setup.el);
}

function startGame(state: Parameters<typeof refreshReports>[0]): void {
  app.replaceChildren();
  view = new GameView(state, { exit: showSetup });
  app.append(view.el);
  view.mount();
  if (import.meta.env.DEV) (window as unknown as { __view: GameView }).__view = view;
}

showSetup();
