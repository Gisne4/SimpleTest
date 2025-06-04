const socket = io();

// --- 屏幕元素 ---
const roomSetupScreen = document.getElementById("room-setup");
const gameLobbyScreen = document.getElementById("game-lobby");
const gameActiveScreen = document.getElementById("game-active");
const gameResultsScreen = document.getElementById("game-results");

const playerNameInput = document.getElementById("playerNameInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const availableRoomsList = document.getElementById("availableRoomsList");
const roomMessage = document.getElementById("roomMessage");

const lobbyRoomIdDisplay = document.getElementById("lobbyRoomIdDisplay");
const playersList = document.getElementById("playersList");
const startGameBtn = document.getElementById("startGameBtn");
const lobbyMessage = document.getElementById("lobbyMessage");

const questionCounter = document.getElementById("question-counter");
const questionText = document.getElementById("questionText");
const answerOBtn = document.getElementById("answerO");
const answerXBtn = document.getElementById("answerX");
const feedbackMessage = document.getElementById("feedbackMessage");
const timerBarContainer = document.getElementById("timer-bar-container");
const timerBar = document.getElementById("timer-bar");

const correctAnswerDisplay = document.getElementById("correctAnswerDisplay"); // 新增
const answerExplanationDisplay = document.getElementById(
  "answerExplanationDisplay"
); // 新增

const finalScoresDiv = document.getElementById("finalScores");
const returnToRoomBtn = document.getElementById("returnToRoomBtn");
const leaveGameBtn = document.getElementById("leaveGameBtn");

// 题目管理元素
const toggleQuestionAdminBtn = document.getElementById(
  "toggleQuestionAdminBtn"
);
const questionAdminForm = document.getElementById("questionAdminForm");
const newQuestionText = document.getElementById("newQuestionText");
const newQuestionAnswer = document.getElementById("newQuestionAnswer");
const newQuestionExplanation = document.getElementById(
  "newQuestionExplanation"
); // 新增
const submitNewQuestionBtn = document.getElementById("submitNewQuestionBtn");
const questionAdminMessage = document.getElementById("questionAdminMessage");

// 阅览/删除题目元素
const refreshQuestionsBtn = document.getElementById("refreshQuestionsBtn");
const currentQuestionsList = document.getElementById("currentQuestionsList");
const questionListMessage = document.getElementById("questionListMessage");

// --- 全局状态 ---
let currentRoomId = null;
let isHost = false;
let currentQuestionDuration = 0;
let timerInterval = null;

// --- 屏幕管理 ---
/**
 * 显示指定屏幕并应用过渡效果。
 * @param {string} screenId - 要显示的屏幕 ID（例如 'room-setup', 'game-lobby'）。
 */
function showScreen(screenId) {
  const screens = [
    roomSetupScreen,
    gameLobbyScreen,
    gameActiveScreen,
    gameResultsScreen,
  ];
  screens.forEach((screen) => {
    screen.classList.remove("show"); // 移除 'show' 类以实现淡出/滑出效果
    screen.classList.add("hidden"); // 添加 'hidden' 以触发 display: none
  });
  // 短暂延迟是为了让 'hidden' 类先应用，确保 CSS 过渡生效。
  setTimeout(() => {
    document.getElementById(screenId).classList.remove("hidden");
    document.getElementById(screenId).classList.add("show");
  }, 10);
}

// --- 事件监听器 ---

// 创建房间按钮
createRoomBtn.addEventListener("click", () => {
  const playerName = playerNameInput.value.trim();
  if (playerName) {
    socket.emit("createOnlyRoom", { playerName }); // 发送创建房间的事件
    roomMessage.textContent = "방 맹그는중...";
    disableRoomSetupControls(true); // 连接时禁用控件
  } else {
    roomMessage.textContent = "닉네임 맹그셈";
  }
});

// 从列表中加入房间（事件委托）
availableRoomsList.addEventListener("click", (event) => {
  // 确保点击的是带有 'joinable-room' 类的列表项
  const clickedLi = event.target.closest("li.joinable-room");
  if (clickedLi) {
    const roomId = clickedLi.dataset.roomId; // 从数据属性中获取房间 ID
    const playerName = playerNameInput.value.trim();

    if (playerName) {
      socket.emit("createOrJoinRoom", { roomId, playerName }); // 使用现有事件加入
      roomMessage.textContent = `방에 입장하는중 ${roomId}...`;
      disableRoomSetupControls(true); // 连接时禁用控件
    } else {
      roomMessage.textContent = "좋은말로 할때 닉네임 적어라";
    }
  }
});

// 切换题目管理表单可见性
toggleQuestionAdminBtn.addEventListener("click", () => {
  questionAdminForm.classList.toggle("hidden");
  if (!questionAdminForm.classList.contains("hidden")) {
    toggleQuestionAdminBtn.textContent = "관리";
    fetchQuestions(); // 打开时自动刷新题目
  } else {
    toggleQuestionAdminBtn.textContent = "문제관리";
  }
  // 切换时清除信息，以重新开始
  questionAdminMessage.textContent = "";
  questionAdminMessage.classList.remove("success", "error", "show");
  questionListMessage.textContent = "";
  questionListMessage.classList.remove("success", "error");
});

// 提交新题目按钮
submitNewQuestionBtn.addEventListener("click", async () => {
  const question = newQuestionText.value.trim();
  const answer = newQuestionAnswer.value;
  const explanation = newQuestionExplanation.value.trim(); // 获取说明

  if (!question || !answer) {
    displayQuestionAdminMessage("문제랑답 잘 맹글어", "error");
    return;
  }
  if (answer !== "O" && answer !== "X") {
    displayQuestionAdminMessage("답은 O OR X！", "error");
    return;
  }

  submitNewQuestionBtn.disabled = true; // 防止重复点击
  questionAdminMessage.textContent = "지금추가중...";
  questionAdminMessage.classList.remove("success", "error");
  questionAdminMessage.classList.add("show"); // 确保加载时信息可见

  try {
    const response = await fetch("/api/questions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question, answer, explanation }), // 包含 explanation
    });

    const data = await response.json();

    if (response.ok) {
      displayQuestionAdminMessage("추가성공!", "success");
      newQuestionText.value = ""; // 清空表单输入
      newQuestionAnswer.value = ""; // 重置选择
      newQuestionExplanation.value = ""; // 清空说明
      fetchQuestions(); // 添加后刷新列表
    } else {
      // 处理服务器端错误（例如，验证失败）
      displayQuestionAdminMessage(
        `안됨: ${data.message || "잘모르겠음"}`,
        "error"
      );
    }
  } catch (error) {
    // 处理网络错误（例如，服务器宕机）
    console.error("개같히 실패!:", error);
    displayQuestionAdminMessage("인터넷선 뽑혔냐?", "error");
  } finally {
    submitNewQuestionBtn.disabled = false; // 重新启用按钮
  }
});

// 刷新题目列表按钮
refreshQuestionsBtn.addEventListener("click", fetchQuestions);

// 删除题目（列表的事件委托）
currentQuestionsList.addEventListener("click", async (event) => {
  const deleteBtn = event.target.closest(".delete-question-btn");
  if (deleteBtn) {
    const questionId = deleteBtn.dataset.questionId;
    if (!confirm("지우실?")) {
      return; // 用户取消
    }

    displayQuestionListMessage("OKDK...", "");
    try {
      const response = await fetch(`/api/questions/${questionId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok) {
        displayQuestionListMessage("다지움", "success");
        fetchQuestions(); // 删除后刷新列表
      } else {
        displayQuestionListMessage(
          `아놔: ${data.message || "잘모르겠음"}`,
          "error"
        );
      }
    } catch (error) {
      console.error("실패!:", error);
      displayQuestionListMessage("인터넷선 뽑힘", "error");
    }
  }
});

/**
 * 在题目管理区域显示消息并应用样式。
 * @param {string} message - 要显示的消息。
 * @param {'success'|'error'|''} type - 消息类型（用于样式）。
 */
function displayQuestionAdminMessage(message, type) {
  questionAdminMessage.textContent = message;
  questionAdminMessage.classList.remove("success", "error"); // 移除之前的类型
  if (type) {
    questionAdminMessage.classList.add(type); // 添加新类型
  }
  questionAdminMessage.classList.add("show"); // 触发动画以显示
  // 几秒后隐藏消息
  setTimeout(() => {
    questionAdminMessage.classList.remove("show");
    // 动画结束后清除文本，使界面更整洁（调整延迟以匹配 CSS 过渡）
    setTimeout(() => (questionAdminMessage.textContent = ""), 500);
  }, 3000);
}

/**
 * 在题目列表区域显示消息并应用样式。
 * @param {string} message - 要显示的消息。
 * @param {'success'|'error'|''} type - 消息类型（用于样式）。
 */
function displayQuestionListMessage(message, type) {
  questionListMessage.textContent = message;
  questionListMessage.classList.remove("success", "error");
  if (type) {
    questionListMessage.classList.add(type);
  }
  questionListMessage.classList.add("show");
  setTimeout(() => {
    questionListMessage.classList.remove("show");
    setTimeout(() => (questionListMessage.textContent = ""), 500);
  }, 3000);
}

/**
 * 从服务器获取并显示题目列表。
 */
async function fetchQuestions() {
  currentQuestionsList.innerHTML = "<li>문제를 불러오는중...</li>";
  questionListMessage.textContent = "";
  questionListMessage.classList.remove("success", "error");

  try {
    const response = await fetch("/api/questions");
    const questions = await response.json();

    currentQuestionsList.innerHTML = ""; // 清除加载信息

    if (questions.length === 0) {
      currentQuestionsList.innerHTML = "<li>문제가 없으니 문제인거야</li>";
    } else {
      questions.forEach((q) => {
        const li = document.createElement("li");
        // 显示说明，如果存在的话
        const explanationText = q.explanation
          ? `<br><small style="color: #888;">설명: ${q.explanation}</small>`
          : "";
        li.innerHTML = `
                    <span>${q.question} (답: ${q.answer})${explanationText}</span>
                    <button class="delete-question-btn" data-question-id="${q._id}">삭제</button>
                `;
        currentQuestionsList.appendChild(li);
      });
    }
    displayQuestionListMessage("업데이트 완료", "success");
  } catch (error) {
    console.error("문제들고 오는데 문재생김:", error);
    currentQuestionsList.innerHTML = "<li>문제 들고 오는거 실패</li>";
    displayQuestionListMessage("문제 들고 올려니 빡세군", "error");
  }
}

// 开始游戏按钮（在大厅中）
startGameBtn.addEventListener("click", () => {
  socket.emit("startGame");
});

// 答案按钮（O/X）
answerOBtn.addEventListener("click", () => sendAnswer("O"));
answerXBtn.addEventListener("click", () => sendAnswer("X"));

// 返回房间大厅按钮（游戏结束后）
returnToRoomBtn.addEventListener("click", () => {
  showScreen("game-lobby");
  lobbyMessage.textContent = isHost
    ? "방장 시작해"
    : "방장이 시작할때까지 ㄱㄷ...";
  startGameBtn.disabled = !isHost; // 如果当前玩家是房主，则启用开始按钮
});

// 离开游戏按钮（游戏结束后，刷新页面）
leaveGameBtn.addEventListener("click", () => {
  window.location.reload(); // 最简单的离开并返回房间设置的方法
});

/**
 * 将玩家的答案发送到服务器。
 * @param {string} answer - 选择的答案（'O' 或 'X'）。
 */
function sendAnswer(answer) {
  socket.emit("answer", answer);
  answerOBtn.disabled = true; // 回答后禁用按钮
  answerXBtn.disabled = true;
  // 反馈将在从服务器收到 'playerAnswered' 事件时显示
}

/**
 * 禁用/启用房间设置屏幕上的控件。
 * @param {boolean} disable - true 为禁用，false 为启用。
 */
function disableRoomSetupControls(disable) {
  playerNameInput.disabled = disable;
  createRoomBtn.disabled = disable;
  availableRoomsList.style.pointerEvents = disable ? "none" : "auto"; // 禁用房间列表点击
  availableRoomsList.style.opacity = disable ? "0.7" : "1"; // 禁用列表的视觉反馈

  // 禁用/隐藏题目管理控件，当不在设置屏幕或连接中时
  toggleQuestionAdminBtn.disabled = disable;
  if (disable) {
    questionAdminForm.classList.add("hidden"); // 隐藏表单
    toggleQuestionAdminBtn.textContent = "문제 관리"; // 重置按钮文本
    questionAdminMessage.textContent = ""; // 清除信息
    questionAdminMessage.classList.remove("success", "error", "show");
    questionListMessage.textContent = ""; // 清除题目列表信息
    questionListMessage.classList.remove("success", "error");
    currentQuestionsList.innerHTML = "<li>새로고침</li>"; // 重置题目列表内容
  }
}

// --- Socket.IO 监听器 ---

// 成功连接到 Socket.IO 服务器时
socket.on("connect", () => {
  console.log("已连接到服务器，ID:", socket.id);
  showScreen("room-setup");
  disableRoomSetupControls(false);
});

// 通用服务器消息（例如，错误消息、玩家加入/离开通知）
socket.on("message", (msg) => {
  console.log("服务器消息:", msg);
  // 在适当的屏幕上显示消息
  if (!currentRoomId || roomSetupScreen.classList.contains("show")) {
    // 如果在设置屏幕或尚未进入房间
    roomMessage.textContent = msg;
    disableRoomSetupControls(false); // 如果加入/创建时出错，重新启用控件
  } else if (
    gameLobbyScreen.classList.contains("hidden") &&
    gameActiveScreen.classList.contains("hidden") &&
    gameResultsScreen.classList.contains("show")
  ) {
    // 如果在结果屏幕，将消息添加到分数下方
    const msgElem = document.createElement("p");
    msgElem.textContent = msg;
    msgElem.style.marginTop = "10px";
    finalScoresDiv.appendChild(msgElem);
  } else if (gameLobbyScreen.classList.contains("hidden")) {
    // 在游戏中
    feedbackMessage.textContent = msg;
    feedbackMessage.classList.add("show"); // 显示动画
    setTimeout(() => feedbackMessage.classList.remove("show"), 3000);
  } else {
    // 在大厅中
    lobbyMessage.textContent = msg;
  }
});

// 更新可用房间列表
socket.on("updateRoomList", (rooms) => {
  availableRoomsList.innerHTML = ""; // 清空当前列表
  if (rooms.length === 0) {
    availableRoomsList.innerHTML =
      '<li class="no-room-msg">방이 없으면 만들면 되는겨</li>';
  } else {
    rooms.forEach((room) => {
      const li = document.createElement("li");
      li.classList.add("joinable-room"); // 用于标识可点击房间的类
      li.dataset.roomId = room.id; // 存储房间 ID 用于加入
      li.innerHTML = `
                <span>방: ${room.id}</span>
                <span>인원: ${room.playersCount}/${room.maxPlayers}</span>
            `;
      availableRoomsList.appendChild(li);
    });
  }
});

// 玩家成功加入（或创建并自动加入）房间时
socket.on("roomJoined", (data) => {
  currentRoomId = data.roomId;
  isHost = data.isHost; // 设置当前玩家的主机状态
  lobbyRoomIdDisplay.textContent = `방ID: ${currentRoomId}`;
  showScreen("game-lobby");
  startGameBtn.disabled = !isHost; // 只有主机才能开始游戏
  lobbyMessage.textContent = isHost ? "너가방장임" : "방장을 기둘리셈...";
});

// 更新当前房间中的玩家列表
socket.on("updatePlayers", (players) => {
  if (!currentRoomId) return; // 确保玩家在房间中

  playersList.innerHTML = ""; // 清空当前玩家列表
  const playerIds = Object.keys(players);

  if (playerIds.length === 0) {
    playersList.innerHTML = "<li>방에 플레이어가 없음</li>";
    startGameBtn.disabled = true; // 没有玩家不能开始游戏
    return;
  }

  playerIds.forEach((id) => {
    const player = players[id];
    const li = document.createElement("li");
    li.textContent = `${player.name}: ${player.score} 分`;
    if (id === socket.id) {
      li.style.fontWeight = "bold";
      li.style.backgroundColor = "#dff0d8"; // 突出显示当前玩家
    }
    // 主机显示简单的启发式：如果我是主机，就突出显示我。否则，突出显示列表中的第一个玩家。
    // 为了更强大的主机显示，服务器应该在 updatePlayers 中发送 hostId。
    if (isHost && id === socket.id) {
      // 如果当前玩家是主机
      li.classList.add("player-list-host");
    } else if (!isHost && playerIds[0] === id) {
      // 如果当前玩家不是主机，则假定列表中的第一个玩家是主机
      li.classList.add("player-list-host");
    }
    playersList.appendChild(li);
  });

  if (isHost) {
    startGameBtn.disabled = playerIds.length < 1; // 主机可以开始，如果至少有 1 个玩家（包括自己）
  } else {
    startGameBtn.disabled = true; // 非主机不能开始
  }
});

// 游戏开始时
socket.on("gameStart", () => {
  showScreen("game-active");
  feedbackMessage.classList.remove("show");
  // 清除之前可能显示的答案和说明
  correctAnswerDisplay.textContent = "";
  correctAnswerDisplay.classList.remove("show", "correct-answer");
  answerExplanationDisplay.textContent = "";
  answerExplanationDisplay.classList.remove("show");
});

// 收到新题目时
socket.on("newQuestion", (data) => {
  showScreen("game-active");
  questionCounter.textContent = `问题 ${data.index + 1}/${data.total}`;
  questionText.textContent = "";
  feedbackMessage.classList.remove("show");
  answerOBtn.disabled = false;
  answerXBtn.disabled = false;

  // 每次显示新问题时，清除之前的正确答案和说明
  correctAnswerDisplay.textContent = "";
  correctAnswerDisplay.classList.remove("show", "correct-answer");
  answerExplanationDisplay.textContent = "";
  answerExplanationDisplay.classList.remove("show");

  questionText.classList.remove("show");
  setTimeout(() => {
    // 打字开始前的短暂延迟
    let i = 0;
    const text = data.question;
    function typeWriter() {
      if (i < text.length) {
        questionText.textContent += text.charAt(i);
        i++;
        setTimeout(typeWriter, 50);
      } else {
        questionText.classList.add("show");
      }
    }
    typeWriter();
  }, 100);

  clearInterval(timerInterval); // 清除任何先前的计时器
  currentQuestionDuration = data.duration;
  timerBar.style.width = "100%"; // 开始时全宽
  timerBar.style.backgroundColor = "#28a745"; // 绿色
  timerInterval = setInterval(() => {
    currentQuestionDuration--;
    const percentage = (currentQuestionDuration / data.duration) * 100;
    timerBar.style.width = `${percentage}%`; // 更新进度条宽度
    if (percentage < 30) {
      timerBar.style.backgroundColor = "#ffc107"; // 时间不足时变黄
    }
    if (percentage < 10) {
      timerBar.style.backgroundColor = "#dc3545"; // 紧急时变红
    }

    if (currentQuestionDuration <= 0) {
      clearInterval(timerInterval); // 停止计时器
      answerOBtn.disabled = true; // 禁用答案按钮
      answerXBtn.disabled = true;
      feedbackMessage.textContent = "TIME OUT!"; // 显示“时间到”消息
      feedbackMessage.classList.add("show");

      // 时间到时也显示正确答案和说明
      if (data.correct_answer) {
        correctAnswerDisplay.textContent = `정답: ${data.correct_answer}`;
        correctAnswerDisplay.classList.add("show", "correct-answer");
      }
      if (data.explanation) {
        answerExplanationDisplay.textContent = `설명: ${data.explanation}`;
        answerExplanationDisplay.classList.add("show");
      }
    }
  }, 1000); // 每秒更新一次
});

// 玩家回答时（仅针对当前玩家）
socket.on("playerAnswered", (data) => {
  if (data.playerId === socket.id) {
    // 只显示当前玩家回答的反馈
    feedbackMessage.textContent = data.correct ? "어케맞춤?" : "능지보소";
    feedbackMessage.classList.toggle("correct", data.correct); // 应用正确/错误样式
    feedbackMessage.classList.toggle("incorrect", !data.correct);
    feedbackMessage.classList.add("show");
  }

  // 显示正确答案和说明
  if (data.correct_answer) {
    correctAnswerDisplay.textContent = `정답: ${data.correct_answer}`;
    correctAnswerDisplay.classList.add("show", "correct-answer");
  }
  if (data.explanation) {
    answerExplanationDisplay.textContent = `설명: ${data.explanation}`;
    answerExplanationDisplay.classList.add("show");
  }
});

// 游戏结束时
socket.on("gameEnd", (finalPlayers) => {
  showScreen("game-results");
  finalScoresDiv.innerHTML = ""; // 清除之前的分数
  // 按分数降序排列玩家
  const sortedPlayers = Object.values(finalPlayers).sort(
    (a, b) => b.score - a.score
  );
  sortedPlayers.forEach((player) => {
    const li = document.createElement("li");
    li.textContent = `${player.name}: ${player.score} 分`;
    finalScoresDiv.appendChild(li);
  });
});

// 与服务器断开连接时
socket.on("disconnect", () => {
  console.log("已与服务器断开连接");
  currentRoomId = null; // 重置房间状态
  isHost = false;
  clearInterval(timerInterval); // 停止任何活动的计时器
  roomMessage.textContent = "你已断开连接，请刷新页面重新加入。";
  showScreen("room-setup"); // 返回设置屏幕
  disableRoomSetupControls(false);
});
