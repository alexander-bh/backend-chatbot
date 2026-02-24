    module.exports = function validateNodeInput(node, input) {

        if (!node.validation?.enabled || !node.validation?.rules?.length) {
            return [];
        }

        const value = String(input ?? "").trim();
        const errors = [];

        for (const rule of node.validation.rules) {

            switch (rule.type) {

                case "required":
                    if (!value.length) errors.push(rule.message);
                    break;

                case "email":
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
                        errors.push(rule.message);
                    break;

                case "phone":
                    if (!/^[0-9]{7,15}$/.test(value))
                        errors.push(rule.message);
                    break;

                case "number":
                    if (isNaN(value)) errors.push(rule.message);
                    break;

                case "min_length":
                    if (value.length < rule.value)
                        errors.push(rule.message);
                    break;

                case "max_length":
                    if (value.length > rule.value)
                        errors.push(rule.message);
                    break;

            }

            if (errors.length) break;
        }

        return errors;
    };