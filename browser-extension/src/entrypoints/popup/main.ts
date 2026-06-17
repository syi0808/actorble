const commandButtons = document.querySelectorAll<HTMLButtonElement>('[data-command]')

for (const button of commandButtons) {
  button.addEventListener('click', () => {
    button.dataset.pending = 'true'
    window.setTimeout(() => {
      delete button.dataset.pending
    }, 160)
  })
}

