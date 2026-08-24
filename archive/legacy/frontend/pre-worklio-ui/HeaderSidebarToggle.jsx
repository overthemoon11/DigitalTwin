export default function HeaderSidebarToggle({ isOpen, onToggle }) {
  return (
    <button
      type="button"
      className="header-left-sidebar-toggle"
      onClick={onToggle}
      aria-label={isOpen ? "Close left sidebar" : "Open left sidebar"}
      aria-expanded={isOpen}
      title={isOpen ? "Close left sidebar" : "Open left sidebar"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="currentColor"
        className="bi bi-list"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"
        />
      </svg>
    </button>
  );
}
