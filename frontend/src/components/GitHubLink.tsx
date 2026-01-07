export function GitHubLink() {
  return (
    <div
        style={{
          position: "absolute",
          bottom: "10px",
          left: "10px",
          zIndex: 1000,
        }}
      >
        <a
          href="https://github.com/DrChristophFH/klotski-viz"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="github-mark-white.svg"
            alt="GitHub"
            style={{ width: "16px", height: "16px" }}
          />
        </a>
      </div>
  )
}