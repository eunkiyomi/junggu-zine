// Section nav active state + back-to-top button.
const navLinks = [...document.querySelectorAll("#topnav a")];
const sections = navLinks
  .map((a) => document.querySelector(a.getAttribute("href")))
  .filter(Boolean);
const totop = document.getElementById("totop");

const spy = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        const id = "#" + e.target.id;
        navLinks.forEach((a) =>
          a.classList.toggle("active", a.getAttribute("href") === id)
        );
      }
    });
  },
  { rootMargin: "-45% 0px -50% 0px" }
);
sections.forEach((s) => spy.observe(s));

addEventListener("scroll", () => {
  totop.classList.toggle("show", scrollY > 600);
}, { passive: true });

totop.addEventListener("click", () =>
  scrollTo({ top: 0, behavior: "smooth" })
);
