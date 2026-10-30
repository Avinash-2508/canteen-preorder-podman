/** A one-line success or error message under a form. */
export default function Message({ message }) {
  if (!message) return <div className="msg" />;
  return <div className={`msg ${message.error ? 'error' : 'ok'}`}>{message.text}</div>;
}
