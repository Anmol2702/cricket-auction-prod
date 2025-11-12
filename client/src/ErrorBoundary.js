import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to the console and store it in state
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error: error, errorInfo: errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // Render a fallback UI with the error details
      return (
        <div style={{ padding: '20px', backgroundColor: '#fff0f0', border: '2px solid red', margin: '20px', borderRadius: '8px' }}>
          <h1 style={{ color: 'red' }}>Application Crashed</h1>
          <p>The application has encountered an error. Please copy the details below and provide them to fix the issue.</p>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#fdd', padding: '10px', borderRadius: '4px', marginTop: '20px' }}>
            <strong>Error:</strong> {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;

