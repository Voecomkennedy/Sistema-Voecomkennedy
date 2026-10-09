const rates = require('../../js/card-rates.js');
exports.install = w => {
    w.CardRates = rates;
    w.CardRatesService = { ready: true, rates: () => ({ ...rates.DEFAULTS }),
        entry: n => rates.entry(rates.DEFAULTS, Number(n)),
        calculate: (base, n) => rates.calculate(base, Number(n), rates.DEFAULTS) };
};
