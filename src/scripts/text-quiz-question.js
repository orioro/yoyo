const COMPONENT_NAME = 'text-quiz-question'

const createInstance = (system, componentRoot) => {

  const input = componentRoot.querySelector('input[type="text"]')
  const button = componentRoot.querySelector('button')

  const answer = input.getAttribute('data-answer') && input.getAttribute('data-answer').toLowerCase()

  button.addEventListener('click', () => {
    if (input.value && input.value.toLowerCase() === answer) {
      componentRoot.classList.add('right')
      componentRoot.classList.remove('wrong')
    } else {
      componentRoot.classList.add('wrong')
      componentRoot.classList.remove('right')
    }
    console.log(`clicked ${input.value} === ${answer}`)
  })

  return {
    defaultAction: () => {},
  }
}

export default () => {
  return {
    componentName: COMPONENT_NAME,
    createInstance,
  }
}
