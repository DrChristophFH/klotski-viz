interface WebGPUErrorMsgProps {
  webgpuError: string;
}

export function WebGPUErrorMsg({ webgpuError }: WebGPUErrorMsgProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        fontSize: "20px",
        color: "orange",
        backgroundColor: "#000011",
        padding: "20px",
        textAlign: "center",
      }}
    >
      <div style={{ marginBottom: "20px", fontSize: "28px" }}>
        ⚠️ WebGPU Not Available
      </div>
      <div>{webgpuError}</div>
      <div style={{ marginTop: "20px", fontSize: "14px", opacity: 0.7 }}>
        Please use a browser with WebGPU support (Chrome 113+, Edge 113+, or
        Firefox with flags enabled)
      </div>
    </div>
  );
}
