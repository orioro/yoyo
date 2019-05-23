import {EventEmitter} from 'events'

const arrayAddUnique = (arr, item) => {
  return arr.indexOf(item) === -1 ? [...arr, item] : arr
}

class Game extends EventEmitter {
  constructor() {
    super()
    this.loadFromLocalStorage()

    this.setMaxListeners(100)

    this.emit('game-updated')
  }

  resetGame() {
    this.unlockedActivities = []
    this.saveToLocalStorage()

    this.emit('game-updated')
  }

  unlockActivity(activityId) {
    this.unlockedActivities = arrayAddUnique(this.unlockedActivities, activityId)
    this.activeActivity = activityId
    this.saveToLocalStorage()

    this.emit('game-updated')
  }

  saveToLocalStorage() {
    window.localStorage.setItem('gameData', JSON.stringify({
      unlockedActivities: this.unlockedActivities
    }))
  }

  computeScore() {
    var score = 0
    this.unlockedActivities.forEach(activityId => {
      const activityElement = document.getElementById(activityId)
      const activityScore = parseInt(activityElement.getAttribute('data-game-activity-points'))

      score = score + activityScore
    })

    return score
  }

  isActivityUnlocked(activityId) {
    return this.unlockedActivities.indexOf(activityId) !== -1
  }

  goToHome() {
    this.activeActivity = null
    this.saveToLocalStorage()

    this.emit('game-updated')
  }

  loadFromLocalStorage() {
    const gameDataStr = window.localStorage.getItem('gameData')
    const storedData = gameDataStr ? JSON.parse(gameDataStr) : null
    this.unlockedActivities = storedData ? storedData.unlockedActivities : []
  }
}

export default Game
