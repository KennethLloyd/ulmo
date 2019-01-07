/*2018-11-23*/
ALTER TABLE im_balance_history_details ADD COLUMN expiration_date DATETIME NULL DEFAULT NULL AFTER item_id;

/*2018-11-27*/
ALTER TABLE im_cycle_count ADD COLUMN location_id VARCHAR(100) NOT NULL AFTER id;

/*2018-11-29*/
ALTER TABLE im_cycle_count_details MODIFY COLUMN cc_count DECIMAL(7,2) NULL DEFAULT NULL;
ALTER TABLE im_cycle_count_details MODIFY COLUMN variance DECIMAL(7,2) NULL DEFAULT NULL;
ALTER TABLE im_cycle_count MODIFY COLUMN created DATETIME NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE im_cycle_count MODIFY COLUMN updated DATETIME NULL DEFAULT NULL;
ALTER TABLE im_cycle_count MODIFY COLUMN deleted DATETIME NULL DEFAULT NULL;
ALTER TABLE im_cycle_count ADD COLUMN max_cycle INT(11) NULL DEFAULT 1 AFTER round;

/*2019-01-04*/
CREATE TABLE `im_movement_transaction` (
	`id` VARCHAR(100) NOT NULL,
	`created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated` DATETIME NULL DEFAULT NULL,
	`deleted` DATETIME NULL DEFAULT NULL,
	`user_id` VARCHAR(100) NOT NULL,
	`type` VARCHAR(20) NULL DEFAULT NULL,
	PRIMARY KEY (`id`)
);

/*2019-01-07*/
ALTER TABLE im_location DROP COLUMN user_id;
ALTER TABLE im_item_movement ADD COLUMN franchise_id int(11) not null AFTER id;
ALTER TABLE im_movement_transaction ADD COLUMN franchise_id int(11) not null AFTER id;