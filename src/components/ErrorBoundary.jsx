import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React ErrorBoundary caught error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f8fafc",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "20px"
        }}>
          <div style={{
            maxWidth: "500px",
            width: "100%",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            padding: "32px",
            textAlign: "center",
            border: "1px solid #e2e8f0"
          }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "#fee2e2",
              color: "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px"
            }}>
              <AlertTriangle size={28} />
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem", color: "#0f172a" }}>
              Đã xảy ra sự cố giao diện
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: "0.875rem", color: "#64748b", lineHeight: 1.5 }}>
              Trình duyệt gặp lỗi khi hiển thị. Vui lòng thử tải lại trang hoặc xoá bộ nhớ đệm cache.
            </p>
            {this.state.error && (
              <div style={{
                backgroundColor: "#f1f5f9",
                borderRadius: "6px",
                padding: "12px",
                fontSize: "0.75rem",
                color: "#475569",
                textAlign: "left",
                fontFamily: "monospace",
                overflowX: "auto",
                marginBottom: "20px"
              }}>
                {this.state.error.message || String(this.state.error)}
              </div>
            )}
            <button
              onClick={this.handleReload}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                backgroundColor: "#0284c7",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer"
              }}
            >
              <RefreshCw size={16} />
              <span>Tải lại Trang (Reload)</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
