import { applyCommand } from '../core/game';
import type { GameState } from '../core/state';
import { AiContext, type AiTurnReport } from './context';
import { manageDiplomacy } from './diplomacy';
import { runCityStateTurn, runMachineTurn } from './minor';
import { managePolicies, manageResearch } from './research';
import { manageSettlements } from './settlements';
import { analyseSituation, evaluateStrategy } from './strategy';
import { manageTrade } from './trade';
import { manageUnits } from './units';
import { claimTiles, fulfillQuests, handleMerchants, proposeAgreements } from './commerce';

/**
 * Führt einen vollständigen Zug für einen Computerspieler aus und beendet ihn.
 * Die KI verändert den Spielstand ausschließlich über applyCommand und sieht nur ihr Sichtfeld.
 */
export function runAiTurnDetailed(state: GameState, playerId: number): AiTurnReport {
  if (state.gameOver || state.currentPlayer !== playerId) {
    return { playerId, turn: state.turn, commands: 0, failed: 0, failures: [] };
  }
  const ctx = new AiContext(state, playerId);
  const kind = ctx.player.kind;
  if (ctx.player.alive) {
    if (kind === 'cityState') {
      ctx.situation = analyseSituation(ctx);
      runCityStateTurn(ctx);
    } else if (kind === 'machine') {
      ctx.situation = analyseSituation(ctx);
      runMachineTurn(ctx);
    } else {
      playMajorTurn(ctx);
    }
  }
  // Der Zug endet immer – auch wenn die Sicherheitsgrenze für Befehle erreicht wurde
  if (!state.gameOver && state.currentPlayer === playerId) {
    applyCommand(state, playerId, { type: 'endTurn' });
    ctx.report.commands++;
  }
  return ctx.report;
}

function playMajorTurn(ctx: AiContext): void {
  const { mem, state } = ctx;
  // Verluste erkennen (für Friedensentscheidungen)
  const count = ctx.view.ownSettlements().length;
  if (count < mem.settlementCount) mem.lostSettlementTurn = state.turn;
  // 1) Lagebewertung und Ziele
  evaluateStrategy(ctx);
  // 2) Diplomatie
  manageDiplomacy(ctx);
  // 3) Forschung und Politiken
  manageResearch(ctx);
  managePolicies(ctx);
  // 4) Einheiten (Gründungen zuerst, damit neue Siedlungen gleich eine Bauliste erhalten)
  manageUnits(ctx);
  // 5) Siedlungen
  ctx.view.refresh();
  manageSettlements(ctx);
  // 6) Handel: Weltmarkt, Abkommen, Händler
  manageTrade(ctx);
  proposeAgreements(ctx);
  handleMerchants(ctx);
  fulfillQuests(ctx);
  claimTiles(ctx);
  // Forschung kann durch Kuriositäten abgeschlossen worden sein
  manageResearch(ctx);
  mem.settlementCount = ctx.view.ownSettlements().length;
}

/** Spielt den Zug des Spielers playerId (KI, Stadtstaat oder Maschine) und beendet ihn. */
export function runAiTurn(state: GameState, playerId: number): void {
  runAiTurnDetailed(state, playerId);
}
