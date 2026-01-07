export function StandardErrorMsg({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        fontSize: "24px",
        color: "red",
        backgroundColor: "#000011",
      }}
    >
      Error: {message}
    </div>
  );
}
