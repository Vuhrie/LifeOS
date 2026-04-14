const drawer = document.querySelector(".drawer");
const menuButton = document.querySelector(".menu-button");
const closeButton = document.querySelector(".drawer-close");

if (drawer && menuButton && closeButton) {
  const setDrawerState = (isOpen) => {
    drawer.classList.toggle("is-open", isOpen);
    drawer.setAttribute("aria-hidden", String(!isOpen));
    menuButton.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("drawer-open", isOpen);
  };

  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    setDrawerState(!isOpen);
  });

  closeButton.addEventListener("click", () => {
    setDrawerState(false);
  });

  drawer.addEventListener("click", (event) => {
    if (event.target === drawer) {
      setDrawerState(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setDrawerState(false);
    }
  });
}
