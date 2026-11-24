/** Hand the browser a file to save. */
export function download(filename, data, mimeType) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Give the download a moment to start before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
