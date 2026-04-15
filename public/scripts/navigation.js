const drawer = document.querySelector(".drawer");
const menuButton = document.querySelector(".menu-button");
const closeButton = document.querySelector(".drawer-close");
const drawerLinks = drawer ? [...drawer.querySelectorAll(".drawer-link")] : [];
const drawerActions = drawer ? [...drawer.querySelectorAll(".drawer-action-button")] : [];
let lastFocusedElement = null;

if (drawer && menuButton && closeButton) {
  const focusableSelectors = [
    "a[href]",
    "button:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(", ");

  const getFocusableElements = () =>
    [...drawer.querySelectorAll(focusableSelectors)].filter((element) => !element.hasAttribute("disabled"));

  const setDrawerState = (isOpen) => {
    drawer.classList.toggle("is-open", isOpen);
    drawer.setAttribute("aria-hidden", String(!isOpen));
    menuButton.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("drawer-open", isOpen);

    if (isOpen) {
      lastFocusedElement = document.activeElement;
      closeButton.focus();
      return;
    }

    if (lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus();
    } else {
      menuButton.focus();
    }
  };

  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    setDrawerState(!isOpen);
  });

  closeButton.addEventListener("click", () => {
    setDrawerState(false);
  });

  drawerLinks.forEach((link) => {
    link.addEventListener("click", () => {
      setDrawerState(false);
    });
  });

  drawerActions.forEach((action) => {
    action.addEventListener("click", () => {
      setDrawerState(false);
    });
  });

  drawer.addEventListener("click", (event) => {
    if (event.target === drawer) {
      setDrawerState(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    const isOpen = drawer.classList.contains("is-open");
    if (!isOpen) {
      return;
    }

    if (event.key === "Escape") {
      setDrawerState(false);
      return;
    }

    if (event.key === "Tab") {
      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  });
}
