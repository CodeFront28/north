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
