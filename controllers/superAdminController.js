const Template = require('../models/Template');
const Article = require('../models/Article');
const User = require('../models/User');

exports.getGlobalDashboard = async (req, res) => {
    try {
        const [allTemplates, allArticles, allUsers] = await Promise.all([
            Template.find().populate('author', 'username').sort({ createdAt: -1 }),
            Article.find().populate('author', 'username').sort({ createdAt: -1 }),
            User.find().select('-password')
        ]);

        res.render('super_admin_dashboard', {
            templates: allTemplates,
            articles: allArticles,
            users: allUsers,
            page: 'superadmin'
        });
    } catch (error) {
        res.status(500).send("Error loading global data.");
    }
};
