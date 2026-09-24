const button = document.getElementById("copy-install");
const command = document.getElementById("install-command");
const status = document.getElementById("copy-status");

if (button && command && status) {
  button.hidden = false;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(command.textContent.trim());
      status.textContent = "Copied! Paste into your terminal to install.";
    } catch {
      // Clipboard access may be denied; keep the command selectable without it.
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(command);
      selection?.removeAllRanges();
      selection?.addRange(range);
      status.textContent = "Select and copy the install command above.";
    } finally {
      button.disabled = false;
    }
  });
}
