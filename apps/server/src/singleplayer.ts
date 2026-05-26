import crypto from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  createSeededRandom,
  defaultEconomyConfig,
  generateWeather,
  getCupCost,
  getMaxPrice,
  getMaxPosters,
  getPosterCost,
  getTriviaQuestionCount,
  setupInputSchema,
  simulateDay,
  socketEvents,
  triviaAnswerInputSchema,
  type PlayerDayResult,
  type SingleplayerSavePayload,
  type SingleplayerPhase,
  type SingleplayerSnapshot,
  type SingleplayerTriviaSnapshot,
  type TriviaQuestionView,
  type WeatherResult
} from "@lemonade-game/shared";
import { createSingleplayerSaveData, readSingleplayerSaveData } from "./singleplayer-save";

type TriviaQuestion = TriviaQuestionView & {
  correctAnswerIndex: number;
};

type TriviaState = {
  rewardPct: number;
  rewardCoins: number;
  requiredQuestions: number;
  currentQuestionIndex: number;
  status: "active" | "passed" | "failed";
  questions: TriviaQuestion[];
};

type SingleplayerState = {
  seed: string;
  phase: SingleplayerPhase;
  day: number;
  coins: number;
  weather: WeatherResult;
  lastResult?: PlayerDayResult;
  trivia?: TriviaState;
};

type SaveableSingleplayerState = SingleplayerState & {
  phase: SingleplayerSavePayload["phase"];
};

const sessions = new Map<string, SingleplayerState>();

type SingleplayerHandlerOptions = {
  saveSecret: string;
};

const triviaBank: TriviaQuestion[] = [
  {
    id: "lemons-origin",
    question: "Which fruit family do lemons belong to?",
    choices: ["Citrus", "Berry", "Melon", "Stone fruit"],
    correctAnswerIndex: 0
  },
  {
    id: "weather-hot-sales",
    question: "In the Lemonade Game, what usually happens on a hot day?",
    choices: ["More people want lemonade", "Cups become free", "Posters stop working", "The day is skipped"],
    correctAnswerIndex: 0
  },
  {
    id: "coin-profit",
    question: "Profit is best described as...",
    choices: ["Revenue minus costs", "Visitors minus posters", "Weather times cups", "Price plus day number"],
    correctAnswerIndex: 0
  },
  {
    id: "poster-effect",
    question: "What do posters mainly help with?",
    choices: ["Getting more visitors", "Lowering cup cost", "Changing your name", "Skipping trivia"],
    correctAnswerIndex: 0
  },
  {
    id: "unsold-cups",
    question: "What happens to unsold lemonade cups at the end of the day?",
    choices: ["They are lost", "They double", "They become posters", "They refund automatically"],
    correctAnswerIndex: 0
  },
  {
    id: "price-risk",
    question: "What is the risk of setting lemonade prices too high?",
    choices: ["Fewer visitors buy", "Weather disappears", "Coins reset", "The stand closes forever"],
    correctAnswerIndex: 0
  }
];

export function registerSingleplayerHandlers(io: Server, options: SingleplayerHandlerOptions) {
  io.on("connection", (socket) => {
    socket.on(socketEvents.client.singleplayerStart, () => {
      const state = createInitialState();
      sessions.set(socket.id, state);
      emitSnapshot(socket, state, options.saveSecret);
    });

    socket.on(socketEvents.client.singleplayerLoad, (payload) => {
      const state = createStateFromSave(payload, options.saveSecret);

      if (!state) {
        socket.emit(socketEvents.server.commandError, {
          code: "INVALID_SETUP",
          message: "Saved singleplayer data could not be loaded."
        });
        return;
      }

      sessions.set(socket.id, state);
      emitSnapshot(socket, state, options.saveSecret);
    });

    socket.on(socketEvents.client.singleplayerContinue, () => {
      const state = sessions.get(socket.id) ?? createInitialState();
      sessions.set(socket.id, state);
      continueSingleplayer(state);
      emitSnapshot(socket, state, options.saveSecret);
    });

    socket.on(socketEvents.client.singleplayerNextDay, () => {
      const state = sessions.get(socket.id) ?? createInitialState();
      sessions.set(socket.id, state);
      advanceToNextDay(state);
      emitSnapshot(socket, state, options.saveSecret);
    });

    socket.on(socketEvents.client.singleplayerSubmitSetup, (payload) => {
      const state = sessions.get(socket.id) ?? createInitialState();
      sessions.set(socket.id, state);

      if (state.phase !== "SETUP") {
        socket.emit(socketEvents.server.commandError, {
          code: "INVALID_PHASE",
          message: "Setup can only be submitted during setup."
        });
        return;
      }

      const parsed = setupInputSchema.safeParse(payload);

      if (!parsed.success) {
        socket.emit(socketEvents.server.commandError, {
          code: "INVALID_SETUP",
          message: "Setup values are invalid."
        });
        return;
      }

      try {
        const result = simulateDay({
          day: state.day,
          startingBalance: state.coins,
          setup: parsed.data,
          seed: `${state.seed}:day:${state.day}`,
          weather: state.weather
        });

        state.phase = "SUMMARY";
        state.coins = result.endingBalance;
        state.lastResult = result;
        delete state.trivia;
        emitSnapshot(socket, state, options.saveSecret);
      } catch (error) {
        const code = error instanceof Error ? error.message : "INVALID_SETUP";

        socket.emit(socketEvents.server.commandError, {
          code,
          message: getSingleplayerSetupErrorMessage(code)
        });
      }
    });

    socket.on(socketEvents.client.singleplayerAnswerTrivia, (payload) => {
      const state = sessions.get(socket.id);

      if (!state || state.phase !== "TRIVIA" || !state.trivia || state.trivia.status !== "active") {
        socket.emit(socketEvents.server.commandError, {
          code: "INVALID_PHASE",
          message: "Trivia is not active."
        });
        return;
      }

      const parsed = triviaAnswerInputSchema.safeParse(payload);

      if (!parsed.success) {
        socket.emit(socketEvents.server.commandError, {
          code: "INVALID_SETUP",
          message: "Trivia answer is invalid."
        });
        return;
      }

      const currentQuestion = state.trivia.questions[state.trivia.currentQuestionIndex];

      if (!currentQuestion || parsed.data.answerIndex !== currentQuestion.correctAnswerIndex) {
        state.trivia.status = "failed";
        emitSnapshot(socket, state, options.saveSecret);
        return;
      }

      state.trivia.currentQuestionIndex += 1;

      if (state.trivia.currentQuestionIndex >= state.trivia.requiredQuestions) {
        state.trivia.status = "passed";
        state.coins += state.trivia.rewardCoins;
      }

      emitSnapshot(socket, state, options.saveSecret);
    });

    socket.on("disconnect", () => {
      sessions.delete(socket.id);
    });
  });
}

function createInitialState(): SingleplayerState {
  const seed = crypto.randomUUID();

  return {
    seed,
    phase: "WEATHER_REVEAL",
    day: 1,
    coins: defaultEconomyConfig.startingCoins.singleplayer,
    weather: generateWeather(`${seed}:weather:1`)
  };
}

function getSingleplayerSetupErrorMessage(code: string): string {
  if (code === "INSUFFICIENT_FUNDS") {
    return "You do not have enough coins.";
  }

  if (code === "PRICE_REQUIRED") {
    return "Cup price must be at least 1 when your cart is not empty.";
  }

  if (code === "PRICE_TOO_HIGH") {
    return "Cup price is too high.";
  }

  if (code === "TOO_MANY_POSTERS") {
    return "You already have the maximum useful posters for today.";
  }

  return "Setup could not be accepted.";
}

function createStateFromSave(payload: unknown, saveSecret: string): SingleplayerState | null {
  const savePayload = readSingleplayerSaveData(payload, saveSecret);

  if (!savePayload) {
    return null;
  }

  const state: SingleplayerState = {
    seed: savePayload.seed,
    phase: savePayload.phase,
    day: savePayload.day,
    coins: savePayload.coins,
    weather: generateWeather(`${savePayload.seed}:weather:${savePayload.day}`)
  };

  if (savePayload.phase === "SUMMARY" && savePayload.lastResult) {
    state.lastResult = savePayload.lastResult;
  }

  if (savePayload.phase === "TRIVIA" && savePayload.trivia) {
    state.trivia = savePayload.trivia;
  }

  if (savePayload.phase === "SUMMARY" && !state.lastResult) {
    state.phase = "WEATHER_REVEAL";
  }

  return state;
}

function continueSingleplayer(state: SingleplayerState) {
  if (state.phase === "WEATHER_REVEAL") {
    state.phase = state.weather.isSpecial ? "SPECIAL_REVEAL" : getSetupOrGameOverPhase(state);
    return;
  }

  if (state.phase === "SPECIAL_REVEAL") {
    state.phase = getSetupOrGameOverPhase(state);
    return;
  }

  if (state.phase === "SUMMARY") {
    const trivia = maybeCreateTrivia(state);

    if (trivia) {
      state.phase = "TRIVIA";
      state.trivia = trivia;
      return;
    }

    advanceToNextDay(state);
    return;
  }

  if (state.phase === "TRIVIA" && state.trivia?.status !== "active") {
    advanceToNextDay(state);
  }
}

function getSetupOrGameOverPhase(state: SingleplayerState): SingleplayerPhase {
  return state.coins < getCupCost(state.day) ? "GAME_OVER" : "SETUP";
}

function advanceToNextDay(state: SingleplayerState) {
  state.day += 1;
  state.phase = "WEATHER_REVEAL";
  state.weather = generateWeather(`${state.seed}:weather:${state.day}`);
  delete state.lastResult;
  delete state.trivia;
}

function maybeCreateTrivia(state: SingleplayerState): TriviaState | null {
  const random = createSeededRandom(`${state.seed}:trivia:${state.day}`);

  if (random() * 100 >= defaultEconomyConfig.trivia.chancePct) {
    return null;
  }

  const rewardPct = Math.floor(random() * 10) + 1;
  const requiredQuestions = getTriviaQuestionCount(rewardPct);
  const rewardCoins = Math.ceil(state.coins * (rewardPct / 100));
  const questions = pickTriviaQuestions(requiredQuestions, random);

  return {
    rewardPct,
    rewardCoins,
    requiredQuestions,
    currentQuestionIndex: 0,
    status: "active",
    questions
  };
}

function pickTriviaQuestions(count: number, random: () => number): TriviaQuestion[] {
  const pool = [...triviaBank];
  const selected: TriviaQuestion[] = [];

  while (selected.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    const [question] = pool.splice(index, 1);

    if (question) {
      selected.push(shuffleTriviaQuestionChoices(question, random));
    }
  }

  return selected;
}

function shuffleTriviaQuestionChoices(question: TriviaQuestion, random: () => number): TriviaQuestion {
  const choices = question.choices.map((choice, index) => ({
    choice,
    isCorrect: index === question.correctAnswerIndex
  }));

  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const currentChoice = choices[index];
    const swapChoice = choices[swapIndex];

    if (currentChoice && swapChoice) {
      choices[index] = swapChoice;
      choices[swapIndex] = currentChoice;
    }
  }

  return {
    ...question,
    choices: choices.map(({ choice }) => choice),
    correctAnswerIndex: choices.findIndex(({ isCorrect }) => isCorrect)
  };
}

function emitSnapshot(socket: Socket, state: SingleplayerState, saveSecret: string) {
  const snapshot: SingleplayerSnapshot = {
    phase: state.phase,
    day: state.day,
    coins: state.coins,
    weather: state.weather,
    cupCost: getCupCost(state.day),
    posterCost: getPosterCost(state.day),
    maxPosters: getMaxPosters(),
    maxPrice: getMaxPrice(getCupCost(state.day)),
    configVersion: defaultEconomyConfig.version
  };

  if (isSaveableState(state)) {
    snapshot.saveData = createSaveData(state, saveSecret);
  }

  if (state.lastResult) {
    snapshot.lastResult = state.lastResult;
  }

  if (state.trivia) {
    snapshot.trivia = createTriviaSnapshot(state.trivia);
  }

  socket.emit(socketEvents.server.singleplayerSnapshot, snapshot);
}

function createSaveData(state: SaveableSingleplayerState, saveSecret: string) {
  return createSingleplayerSaveData(createSavePayload(state), saveSecret);
}

function createSavePayload(state: SaveableSingleplayerState): SingleplayerSavePayload {
  const savedAt = Date.now();

  const savePayload: SingleplayerSavePayload = {
    version: 1,
    configVersion: defaultEconomyConfig.version,
    seed: state.seed,
    phase: state.phase,
    day: state.day,
    coins: state.coins,
    savedAt
  };

  if (state.phase === "SUMMARY" && state.lastResult) {
    savePayload.lastResult = state.lastResult;
  }

  if (state.phase === "TRIVIA") {
    if (!state.trivia) {
      throw new Error("Trivia save state is missing.");
    }

    savePayload.trivia = state.trivia;
  }

  return savePayload;
}

function isSaveableState(state: SingleplayerState): state is SaveableSingleplayerState {
  return state.phase !== "GAME_OVER";
}

function createTriviaSnapshot(trivia: TriviaState): SingleplayerTriviaSnapshot {
  const question = trivia.questions[trivia.currentQuestionIndex];
  const snapshot: SingleplayerTriviaSnapshot = {
    rewardPct: trivia.rewardPct,
    rewardCoins: trivia.rewardCoins,
    requiredQuestions: trivia.requiredQuestions,
    currentQuestionNumber: Math.min(trivia.currentQuestionIndex + 1, trivia.requiredQuestions),
    status: trivia.status
  };

  if (trivia.status === "active" && question) {
    snapshot.question = {
      id: question.id,
      question: question.question,
      choices: question.choices
    };
  }

  return snapshot;
}
