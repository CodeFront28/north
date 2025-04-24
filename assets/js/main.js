// main.js

// 1) Настройки
const API_URL = "https://api.gen-api.ru/api/v1/networks/gpt-4o-mini";
const AUTH_HEADER =
  "Bearer sk-oad74gGZaTOqNYQhASmVGKHa7yqUUVS1dWhb3Iq7cegAtzw2mK3nEOAyvA95";
const SYSTEM_PROMPT = `Ты — виртуальный менеджер по продажам продюсерского центра «Северный мир». Тебя зовут Шайни.
Цель: Кратко и дружелюбно общаться с посетителем сайта, отвечать на его вопросы об услугах и подвести его к тому, чтобы он оставил номер телефона прямо в этом чате или заполнил заявку на сайте — и с ним обязательно свяжутся.
Тон: Вежливый, дружелюбный, уверенный. Пиши кратко и по делу, как реальный менеджер, не «бот». Здороваться с человеком не нужно, приветственное сообщение уже есть от тебя.
Контекст: У продюсерского центра есть услуги: звукозапись, продвижение артистов, создание клипов, организация концертов, брендинг и т.д.
Задачи:
• Уточнить, чем интересуется посетитель (если сразу не написал).
• Кратко описать подходящие услуги.
• Предложить оставить номер тут в чате или заполнить форму — и с ним свяжутся.
• Если задаёт уточняющие вопросы — ответить, затем снова призвать оставить номер.
• Всегда завершать призывом к действию: «Оставь, пожалуйста, тут свой номер — и мы свяжемся с тобой».
• После того как пользователь оставил номер, поблагодарить и сообщить, что менеджер скоро свяжется.`;
const TG_TOKEN = "7865753936:AAG2RCNVKyzGxp0W71zO7UYWOFQcERxJzgw"; // токен вашего бота
const TG_CHAT_ID = "-4797021119"; // chat_id для отправки заявок

// 2) История диалога и ограничение длины
const chatHistory = [];
const MAX_HISTORY = 8;

// 3) Регулярное выражение для номера в чате
const phoneRe = /\b(?:\+7|8|7|9)(?:[\s\-()]*\d){8,10}\b/;

const tabs = document.querySelector(".roadmap__tabs");

tabs.addEventListener("click", () => {
  const first = tabs.querySelector(".first");
  const second = tabs.querySelector(".second");
  const third = tabs.querySelector(".third");

  // Переходим к новому состоянию:
  first.classList.replace("first", "temp"); // временный маркер
  second.classList.replace("second", "first");
  third.classList.replace("third", "second");
  tabs.querySelector(".temp").classList.replace("temp", "third");
});

// 4) Утилита-пауза
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// добавьте этот скрипт в конец <body> или после загрузки DOM
document.addEventListener("DOMContentLoaded", () => {
  const inner = document.querySelector(".carousel__inner");
  inner.innerHTML += inner.innerHTML;
});

// 5) Функция обращения к Gen-API с учётом истории
async function callGenApi(userText) {
  // Добавляем сообщение пользователя в историю
  chatHistory.push({
    role: "user",
    content: [{ type: "text", text: userText }],
  });
  if (chatHistory.length > MAX_HISTORY) chatHistory.shift();

  // Формируем payload: системный промпт + история диалога
  const payload = {
    is_sync: true,
    messages: [
      { role: "system", content: [{ type: "text", text: SYSTEM_PROMPT }] },
      ...chatHistory,
    ],
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: AUTH_HEADER,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  console.log("Gen-API response →", json);

  // Извлекаем текст ответа
  let replyText;
  if (Array.isArray(json.response) && json.response.length > 0) {
    const el = json.response[0];
    replyText = el.message?.content ?? JSON.stringify(el);
  } else if (json.output !== undefined) {
    replyText = json.output;
  } else if (json.status === "starting") {
    // long-polling
    const reqId = json.request_id;
    while (true) {
      await wait(1000);
      const poll = await fetch(
        `https://api.gen-api.ru/api/v1/request/get/${reqId}`,
        {
          headers: { Authorization: AUTH_HEADER },
        }
      );
      if (!poll.ok) throw new Error(`Poll HTTP ${poll.status}`);
      const pjson = await poll.json();
      if (pjson.status === "success") {
        replyText = pjson.output;
        break;
      }
    }
  } else {
    throw new Error("Неожиданный формат ответа от API");
  }

  // Сохраняем ответ ИИ в историю
  chatHistory.push({
    role: "assistant",
    content: [{ type: "text", text: replyText }],
  });
  if (chatHistory.length > MAX_HISTORY) chatHistory.shift();

  return replyText;
}

// 6) Интеграция с формой чата и пульсацией сферы, а также обработка заявочных форм
document.addEventListener("DOMContentLoaded", () => {
  // — чат
  const aiForm = document.querySelector(".ai__form");
  const textarea = aiForm.querySelector(".message__input");
  const messagesContainer = document.querySelector(".ai__dialogue .messages");
  const spinnerEl = document.querySelector(".ai__sphere");

  // Функция для вывода сообщений
  function appendMessage(text, sender) {
    const span = document.createElement("span");
    span.classList.add("message", sender === "user" ? "sended" : "received");
    span.textContent = text;
    messagesContainer.appendChild(span);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Обработчик отправки в чате
  aiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userText = textarea.value.trim();
    if (!userText) return;

    appendMessage(userText, "user");
    textarea.value = "";

    // Если в чате оставили номер — отправляем в Telegram
    const phoneMatch = userText.match(phoneRe);
    if (phoneMatch) {
      fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TG_CHAT_ID,
          text: `Новая заявка из чата:\nТелефон: ${phoneMatch[0]}`,
        }),
      });
    }

    // Запускаем пульсацию сферы
    spinnerEl.classList.add("process");
    try {
      const aiReply = await callGenApi(userText);
      appendMessage(aiReply, "ai");
    } catch (err) {
      console.error(err);
      appendMessage("Ошибка при обращении к API, см. консоль", "ai");
    } finally {
      spinnerEl.classList.remove("process");
    }
  });

  // — заявочные формы (feedback__form и footer__form)
  const userForms = document.querySelectorAll(".feedback__form, .footer__form");
  userForms.forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault(); // чтобы не перезагружать страницу

      const formData = new FormData(form);
      const name = formData.get("name") || "";
      const phone = formData.get("phone") || "";

      // Формируем текст заявки
      let text = "Новая заявка с сайта:\n";
      if (name) text += `Имя: ${name}\n`;
      text += `Телефон: ${phone}`;

      // Отправляем в Telegram
      fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TG_CHAT_ID,
          text,
        }),
      })
        .then((res) => console.log("Telegram OK", res.status))
        .catch((err) => console.warn("Telegram ERR", err));

      // Сбрасываем форму и уведомляем пользователя
      form.reset();
      alert("Спасибо, наш менеджер скоро Вам позвонит");
    });
  });
});
