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