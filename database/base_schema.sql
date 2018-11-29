-- --------------------------------------------------------
-- Host:                         127.0.0.1
-- Server version:               5.6.33-0ubuntu0.14.04.1 - (Ubuntu)
-- Server OS:                    debian-linux-gnu
-- HeidiSQL Version:             9.5.0.5196
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;


-- Dumping database structure for sme_db
CREATE DATABASE IF NOT EXISTS `sme_db` /*!40100 DEFAULT CHARACTER SET latin1 */;
USE `sme_db`;

-- Dumping structure for table sme_db.im_balance_history
CREATE TABLE IF NOT EXISTS `im_balance_history` (
  `id` varchar(100) NOT NULL,
  `label` varchar(50) DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  `user_id` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Dumping data for table sme_db.im_balance_history: ~0 rows (approximately)
/*!40000 ALTER TABLE `im_balance_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `im_balance_history` ENABLE KEYS */;

-- Dumping structure for table sme_db.im_balance_history_details
CREATE TABLE IF NOT EXISTS `im_balance_history_details` (
  `id` varchar(100) NOT NULL,
  `balance_id` varchar(100) NOT NULL,
  `location_id` varchar(100) NOT NULL,
  `item_id` varchar(100) NOT NULL,
  `quantity` decimal(7,2) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Dumping data for table sme_db.im_balance_history_details: ~0 rows (approximately)
/*!40000 ALTER TABLE `im_balance_history_details` DISABLE KEYS */;
/*!40000 ALTER TABLE `im_balance_history_details` ENABLE KEYS */;

-- Dumping structure for table sme_db.im_cycle_count
CREATE TABLE IF NOT EXISTS `im_cycle_count` (
  `id` varchar(100) NOT NULL,
  `cycle_label` varchar(50) DEFAULT NULL,
  `round` int(11) DEFAULT '0',
  `status` varchar(50) DEFAULT 'PENDING',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL,
  `deleted` datetime NOT NULL,
  `user_id` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Dumping data for table sme_db.im_cycle_count: ~0 rows (approximately)
/*!40000 ALTER TABLE `im_cycle_count` DISABLE KEYS */;
/*!40000 ALTER TABLE `im_cycle_count` ENABLE KEYS */;

-- Dumping structure for table sme_db.im_cycle_count_details
CREATE TABLE IF NOT EXISTS `im_cycle_count_details` (
  `id` varchar(100) NOT NULL,
  `cycle_count_id` varchar(100) DEFAULT NULL,
  `item_id` varchar(100) NOT NULL,
  `actual_quantity` decimal(7,2) NOT NULL,
  `cc_count` decimal(7,2) NOT NULL,
  `variance` decimal(7,2) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Dumping data for table sme_db.im_cycle_count_details: ~0 rows (approximately)
/*!40000 ALTER TABLE `im_cycle_count_details` DISABLE KEYS */;
/*!40000 ALTER TABLE `im_cycle_count_details` ENABLE KEYS */;

-- Dumping structure for table sme_db.im_item_movement
CREATE TABLE IF NOT EXISTS `im_item_movement` (
  `id` varchar(100) NOT NULL,
  `item_id` varchar(100) NOT NULL,
  `quantity` decimal(7,2) NOT NULL,
  `location_id` varchar(100) NOT NULL,
  `expiration_date` datetime DEFAULT NULL,
  `remarks` varchar(200) DEFAULT NULL,
  `type` varchar(20) NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  `user_id` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Dumping data for table sme_db.im_item_movement: ~0 rows (approximately)
/*!40000 ALTER TABLE `im_item_movement` DISABLE KEYS */;
/*!40000 ALTER TABLE `im_item_movement` ENABLE KEYS */;

-- Dumping structure for table sme_db.im_location
CREATE TABLE IF NOT EXISTS `im_location` (
  `id` varchar(100) NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(200) DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  `user_id` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Dumping data for table sme_db.im_location: ~0 rows (approximately)
/*!40000 ALTER TABLE `im_location` DISABLE KEYS */;
/*!40000 ALTER TABLE `im_location` ENABLE KEYS */;

/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IF(@OLD_FOREIGN_KEY_CHECKS IS NULL, 1, @OLD_FOREIGN_KEY_CHECKS) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;


/*2018-11-29*/
CREATE TABLE IF NOT EXISTS `im_movement_transaction` (
  `id` varchar(100) NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  `user_id` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Dumping structure for table sme_db.im_item_movement
CREATE TABLE IF NOT EXISTS `im_item_movement` (
  `id` varchar(100) NOT NULL,
  `transaction_id` varchar(100) NOT NULL,
  `item_id` varchar(100) NOT NULL,
  `quantity` decimal(7,2) NOT NULL,
  `location_id` varchar(100) NOT NULL,
  `expiration_date` datetime DEFAULT NULL,
  `remarks` varchar(200) DEFAULT NULL,
  `type` varchar(20) NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  `user_id` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;