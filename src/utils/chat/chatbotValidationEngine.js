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
                if (!/^\+?\d{7,15}$/.test(value))
                    errors.push(rule.message);
                break;

            case "phone_mx":
                if (!/^\+52\d{10}$/.test(value))
                    errors.push(rule.message);
                break;

            case "phone_country":
                if (!/^\+\d{1,3}/.test(value))
                    errors.push(rule.message);
                break;

            case "integer":
                if (!/^-?\d+$/.test(value))
                    errors.push(rule.message);
                break;

            case "decimal":
                if (!/^-?\d+(\.\d+)?$/.test(value))
                    errors.push(rule.message);
                break;

            case "number":
                if (isNaN(value))
                    errors.push(rule.message);
                break;

            case "MinMax": {

                /* ---------- QUESTION: contar palabras ---------- */

                if (node.node_type === "question") {

                    const words = value.split(/\s+/).filter(Boolean).length;

                    if (
                        (rule.min !== undefined && words < rule.min) ||
                        (rule.max !== undefined && words > rule.max)
                    ) {
                        errors.push(rule.message);
                    }

                }

                /* ---------- NUMBER: validar rango ---------- */

                if (node.node_type === "number") {

                    const num = Number(value);

                    if (
                        isNaN(num) ||
                        (rule.min !== undefined && num < rule.min) ||
                        (rule.max !== undefined && num > rule.max)
                    ) {
                        errors.push(rule.message);
                    }

                }

                break;
            }

        }

        if (errors.length) break;
    }

    return errors;
};