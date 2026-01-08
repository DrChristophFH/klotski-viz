/**
 * DirectionIndicator Component
 * Renders arrow indicators showing available move directions
 */

import styles from './KlotskiPiece.module.css';

interface DirectionIndicatorProps {
  directions: string[];
}

export function DirectionIndicator({ directions }: DirectionIndicatorProps) {
  return (
    <>
      {directions.includes('up') && (
        <div className={`${styles.directionIndicator} ${styles.directionArrowUp}`} />
      )}
      {directions.includes('down') && (
        <div className={`${styles.directionIndicator} ${styles.directionArrowDown}`} />
      )}
      {directions.includes('left') && (
        <div className={`${styles.directionIndicator} ${styles.directionArrowLeft}`} />
      )}
      {directions.includes('right') && (
        <div className={`${styles.directionIndicator} ${styles.directionArrowRight}`} />
      )}
    </>
  );
}

export default DirectionIndicator;
