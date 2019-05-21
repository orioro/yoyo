import {PropTypes} from '@orioro/web-ui-core'

const COMPONENT_NAME = 'game-activity'

const SILHOUETTE_SELECTOR = '.activity__card__illustration__silhouette'

const createInstance = (system, componentRoot, {
  points
}) => {
  const activityId = componentRoot.getAttribute('id')
  const silhouette = componentRoot.querySelector(SILHOUETTE_SELECTOR)

  silhouette.addEventListener('click', () => {
    alert('Abra a câmera e busque no pôster!')
  })

  const unlock = () => {
    window.game.unlockActivity(activityId)

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
