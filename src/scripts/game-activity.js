import {PropTypes} from '@orioro/web-ui-core'

const COMPONENT_NAME = 'game-activity'

const CARD_SELECTOR = '.activity__card'
const ILLUSTRATION_SILHOUETTE_SELECTOR = '.activity__card__illustration__silhouette'
const ILLUSTRATION_FILLED_SELECTOR = '.activity__card__illustration__filled'
const ACTIVITY_FOUND_SELECTOR = '.atividade-encontrada'
const ACTIVITY_UNLOCKED_AUDIO_SELECTOR = `${ACTIVITY_FOUND_SELECTOR} audio`

const unlockAudio = new Audio('resources/score-donut.mp3')

const createInstance = (system, componentRoot, {
  points
}) => {
  const activityId = componentRoot.getAttribute('id')
  const activityFound = componentRoot.querySelector(ACTIVITY_FOUND_SELECTOR)
  const activityCard = componentRoot.querySelector(CARD_SELECTOR)

  activityCard.addEventListener('click', e => {
    if (window.game.isActivityUnlocked(activityId)) {
      open()
    } else {
      alert('Abra a câmera e busque no pôster!')
    }
  })

  activityFound.addEventListener('click', () => {
    if (parseInt(componentRoot.getAttribute('data-game-activity-points')) > 0) {
      playUnlockAudio()
    }
  })

  const playUnlockAudio = () => {
    return new Promise((resolve, reject) => {
      if (unlockAudio.readyState >= 2) {
        console.log('loaded')
        unlockAudio.currentTime = 0
        unlockAudio.play()
        resolve()
      } else {
        console.log('will load')
        unlockAudio.addEventListener('canplay', e => {
          unlockAudio.play()
          resolve()
        })
      }
    })
  }

  const unlock = () => {
    window.game.unlockActivity(activityId)
    if (parseInt(componentRoot.getAttribute('data-game-activity-points')) > 0) {
      playUnlockAudio()
    }

    open()
  }

  const open = () => {
    window.game.activeActivity = activityId
    componentRoot.classList.add('activity--details-open')
  }

  const close = () => {
    window.game.activeActivity = null
    componentRoot.classList.remove('activity--details-open')
  }

  const updateActivityStatus = () => {
    if (window.game.isActivityUnlocked(activityId)) {
      componentRoot.classList.add('activity--details-unlocked')
    } else {
      componentRoot.classList.remove('activity--details-unlocked')
    }

    if (window.game.activeActivity === activityId) {
      open()
    } else {
      close()
    }
  }

  updateActivityStatus()
  window.game.on('game-updated', updateActivityStatus)

  return {
    defaultAction: () => {
      unlock()
    },
    unlock,
    open,
    close
  }
}

export default () => {
  return {
    componentName: COMPONENT_NAME,
    createInstance,
    instancePropTypes: {
      points: PropTypes.number.isRequired,
    },
  }
}
