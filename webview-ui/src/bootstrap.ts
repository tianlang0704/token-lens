import { DEFAULT_COST_FILTER_STATE, WEBVIEW_DATA_ELEMENT_ID } from "@shared/webview-contract";
import type { CostFilterState, WebviewData, WebviewOutboundMessage, WebviewPersistedState } from "@shared/webview-contract";

type VsCodeApi<State> = {
  getState(): State | undefined;
  postMessage(message: unknown): void;
  setState(newState: State): State;
};

declare function acquireVsCodeApi<State>(): VsCodeApi<State>;

const vscodeApi = typeof acquireVsCodeApi === "function"
  ? acquireVsCodeApi<WebviewPersistedState>()
  : undefined;

function normalizeCostFilterState(costFilterState: Partial<CostFilterState> | undefined): CostFilterState {
  return {
    providers: Array.isArray(costFilterState?.providers) ? [...costFilterState.providers] : [...DEFAULT_COST_FILTER_STATE.providers],
    sort: costFilterState?.sort === "desc" ? "desc" : DEFAULT_COST_FILTER_STATE.sort,
    ageFilter: !!costFilterState?.ageFilter,
    collapsed: !!costFilterState?.collapsed,
  };
}

let persistedState = {
  costFilters: normalizeCostFilterState(vscodeApi?.getState()?.costFilters),
};

function savePersistedState(nextState: WebviewPersistedState): void {
  persistedState = { costFilters: normalizeCostFilterState(nextState.costFilters) };
  vscodeApi?.setState(persistedState);
}

function readWebviewData(): WebviewData {
  const dataElement = document.getElementById(WEBVIEW_DATA_ELEMENT_ID);
  if (!(dataElement instanceof HTMLScriptElement)) {
    throw new Error("Missing webview data payload.");
  }

  return JSON.parse(dataElement.textContent ?? "{}") as WebviewData;
}

function postWebviewMessage(message: WebviewOutboundMessage): void {
  vscodeApi?.postMessage(message);
}

function getCostFilterState(): CostFilterState {
  return normalizeCostFilterState(persistedState.costFilters);
}

function setCostFilterState(costFilters: CostFilterState): void {
  savePersistedState({
    costFilters: normalizeCostFilterState(costFilters),
  });
}

let savedModelsState: string[] = (() => {
  try {
    const data = readWebviewData();
    return Array.isArray(data.savedModels) ? [...data.savedModels] : [];
  } catch {
    return [];
  }
})();

function getSavedModels(): string[] {
  return [...savedModelsState];
}

function setSavedModels(savedModels: string[]): void {
  savedModelsState = [...savedModels];
  postWebviewMessage({ type: "saveSavedModels", savedModels: [...savedModels] });
}

export {
  getCostFilterState,
  getSavedModels,
  postWebviewMessage,
  readWebviewData,
  setCostFilterState,
  setSavedModels,
};
