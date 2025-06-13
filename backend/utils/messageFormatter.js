const formatMessage = (template, variables) => {
    // Check if template is defined before trying to use replace
    if (!template) {
        return "An error occurred. Please try again later.";
    }
    
    // If variables are provided, perform the replacement
    if (variables) {
        return template.replace(/{(.*?)}/g, (_, key) => variables[key.trim()] || '');
    }
    
    // If no variables are provided, just return the template
    return template;
};

module.exports = formatMessage;