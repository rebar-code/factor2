export async function loader() {
  // Simple landing page - no authentication needed
  return null;
}

export default function Index() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8", padding: "40px" }}>
      <h1>Factor II Affidavit App</h1>
      <p>This app manages affidavit compliance for Factor II products.</p>
      <p>
        <a href="/admin">Go to Admin Dashboard</a>
      </p>
    </div>
  );
}

