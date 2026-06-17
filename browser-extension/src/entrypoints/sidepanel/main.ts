const sections = document.querySelectorAll<HTMLElement>('section')

for (const section of sections) {
  section.tabIndex = 0
}

